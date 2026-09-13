import asyncio
import random
from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime, timedelta
from functools import wraps
from typing import Any, TypeVar
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from google_autocompleta.config import Settings
from google_autocompleta.data import (
    CATEGORY_NAMES,
    CURRENT_CONTENT_VERSION,
    DAILY_EPOCH,
    puzzle_number,
)
from google_autocompleta.models import Game, GameRound, Prompt, Puzzle
from google_autocompleta.providers import GoogleSuggestProvider
from google_autocompleta.providers.suggestions import normalize_text
from google_autocompleta.schemas import (
    AnswerSlot,
    ArchivePuzzleOut,
    CategoryOut,
    CreateGameRequest,
    GameMode,
    GameState,
    GameStatus,
    GuessOutcome,
    GuessResult,
    MatchKind,
    RoundSummary,
    SlotStatus,
)


class GameError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


_Mutation = TypeVar("_Mutation", bound=Callable[..., Awaitable[GameState]])


def serialized_game_mutation(method: _Mutation) -> _Mutation:  # noqa: UP047
    @wraps(method)
    async def wrapped(
        self: "GameService", session: AsyncSession, game_id: str, *args: Any
    ) -> GameState:
        lock = self._game_locks.setdefault(game_id, asyncio.Lock())
        async with lock:
            return await method(self, session, game_id, *args)

    return wrapped  # type: ignore[return-value]


class GameService:
    _GUESS_STOP_WORDS = {
        "a",
        "al",
        "con",
        "de",
        "del",
        "el",
        "en",
        "la",
        "las",
        "lo",
        "los",
        "o",
        "para",
        "por",
        "que",
        "se",
        "su",
        "sus",
        "the",
        "un",
        "una",
        "unas",
        "unos",
        "y",
    }

    def __init__(self, settings: Settings, provider: GoogleSuggestProvider) -> None:
        self.settings = settings
        self.provider = provider
        self._daily_locks: dict[date, asyncio.Lock] = {}
        self._game_locks: dict[str, asyncio.Lock] = {}

    def today(self) -> date:
        return datetime.now(ZoneInfo(self.settings.daily_timezone)).date()

    async def ensure_daily_puzzle(
        self, session: AsyncSession, puzzle_date: date | None = None
    ) -> Puzzle:
        """Ensure a durable puzzle exists for a daily date.

        The date is selected in the configured local timezone. The per-process
        lock prevents duplicate snapshot inserts when startup and a player
        arrive together; the database unique index remains the final authority
        when multiple API workers are running.
        """
        return await self._daily_puzzle(session, puzzle_date or self.today())

    async def current_daily(self, session: AsyncSession) -> tuple[date, int, str]:
        current = self.today()
        await self.ensure_daily_puzzle(session, current)
        await session.commit()
        return current, puzzle_number(current), self.settings.daily_timezone

    async def list_archive(self, session: AsyncSession) -> list[ArchivePuzzleOut]:
        # Archive is a read-only view of immutable, pre-scheduled snapshots.
        # In particular, never create today's puzzle (or backfill a missing
        # historical date) as a side effect of browsing the archive.
        statement = (
            select(Puzzle, Prompt)
            .join(Prompt, Prompt.id == Puzzle.prompt_id)
            .where(Puzzle.puzzle_date.is_not(None), Puzzle.puzzle_date < self.today())
            .order_by(Puzzle.puzzle_date.desc())
        )
        rows = (await session.execute(statement)).all()
        return [
            ArchivePuzzleOut(
                date=puzzle.puzzle_date,
                number=puzzle_number(puzzle.puzzle_date),
                category=self._category(prompt.category),
                prompt=prompt.text,
            )
            for puzzle, prompt in rows
            if puzzle.puzzle_date is not None
        ]

    async def create_game(self, session: AsyncSession, request: CreateGameRequest) -> GameState:
        category: str | None = request.category or "todas"
        if request.mode is not GameMode.RANDOM:
            category = None
        elif category != "todas" and category not in CATEGORY_NAMES:
            raise GameError("invalid_category", "La categoría seleccionada no existe.")

        requested_date: date | None = None
        if request.mode is GameMode.DAILY:
            requested_date = self.today()
        elif request.mode is GameMode.ARCHIVE:
            requested_date = request.date
        if requested_date is not None:
            if requested_date >= self.today() and request.mode is GameMode.ARCHIVE:
                if requested_date == self.today():
                    raise GameError("today_not_archive", "El reto de hoy se juega en Diario.")
                raise GameError("future_puzzle", "Ese reto diario todavía no está disponible.")
            if requested_date > self.today():
                raise GameError("future_puzzle", "Ese reto diario todavía no está disponible.")
            if requested_date < DAILY_EPOCH:
                raise GameError("puzzle_not_found", "No existe un reto para esa fecha.", 404)

        now = datetime.now(UTC)
        await session.execute(delete(Game).where(Game.expires_at <= now))
        game = Game(
            id=str(uuid4()),
            mode=request.mode.value,
            selected_category=category,
            requested_date=requested_date,
            round_number=1,
            total_rounds=3 if request.mode is GameMode.RANDOM else 1,
            score=0,
            status=GameStatus.PLAYING.value,
            created_at=now,
            updated_at=now,
            expires_at=now + timedelta(hours=self.settings.session_ttl_hours),
        )
        session.add(game)
        await session.flush()

        if requested_date is not None:
            puzzle = await self._daily_puzzle(session, requested_date)
            if puzzle is None:
                raise GameError("puzzle_not_found", "Ese reto no está disponible.", 404)
            planned_puzzles = [puzzle]
        else:
            planned_puzzles = await self._select_random_puzzles(
                session, game, request.recent_puzzle_ids
            )
            puzzle = planned_puzzles[0]
            game.planned_puzzle_ids = [item.id for item in planned_puzzles]
            game.content_version = puzzle.content_version
        session.add(
            GameRound(
                game_id=game.id,
                round_number=1,
                puzzle_id=puzzle.id,
                found_ranks=[],
                guesses=[],
                misses=0,
                score=0,
                status=GameStatus.PLAYING.value,
            )
        )
        await session.commit()
        return await self.get_game(session, game.id)

    async def get_game(
        self,
        session: AsyncSession,
        game_id: str,
        last_result: GuessResult | None = None,
    ) -> GameState:
        game = await session.get(Game, game_id)
        if game is None:
            raise GameError("game_not_found", "La partida no existe.", 404)
        self._ensure_not_expired(game)
        game_round, puzzle, prompt = await self._current_round(session, game)
        return self._state(game, game_round, puzzle, prompt, last_result)

    @serialized_game_mutation
    async def submit_guess(self, session: AsyncSession, game_id: str, raw_guess: str) -> GameState:
        game = await session.get(Game, game_id)
        if game is None:
            raise GameError("game_not_found", "La partida no existe.", 404)
        self._ensure_not_expired(game)
        if game.status != GameStatus.PLAYING.value:
            raise GameError("game_not_playing", "La ronda ya ha terminado.", 409)

        game_round, puzzle, prompt = await self._current_round(session, game)
        prompt_text = puzzle.prompt_text or prompt.text
        normalized_guess = normalize_text(raw_guess)
        if not normalized_guess:
            raise GameError("empty_guess", "Escribe una respuesta antes de probar.")
        guesses = list(game_round.guesses)
        matching_ranks, match_kind, broad = self._classify_guess(
            prompt_text, prompt, puzzle, normalized_guess
        )
        new_matching_ranks = [rank for rank in matching_ranks if rank not in game_round.found_ranks]
        if broad:
            result = GuessResult(
                outcome=GuessOutcome.TOO_BROAD,
                message="Esa palabra aparece en demasiadas respuestas. Añade algo más concreto.",
            )
            return self._state(game, game_round, puzzle, prompt, result)
        if any(item["normalized"] == normalized_guess for item in guesses) or (
            matching_ranks and not new_matching_ranks
        ):
            result = GuessResult(
                outcome=GuessOutcome.DUPLICATE,
                matched_ranks=matching_ranks,
                matched_rank=matching_ranks[0] if matching_ranks else None,
                match_kind=match_kind,
                message="Ya habías probado esa respuesta.",
            )
            return self._state(game, game_round, puzzle, prompt, result)

        found_ranks = list(game_round.found_ranks)
        points = 0
        if new_matching_ranks:
            found_ranks.extend(new_matching_ranks)
            found_ranks.sort()
            points = sum(self._points_for_rank(rank) for rank in new_matching_ranks)
            game_round.found_ranks = found_ranks
            game_round.score += points
            game.score += points
            outcome = GuessOutcome.CORRECT
            message = (
                f"¡Combo x{len(new_matching_ranks)}! +{points:,} puntos".replace(",", ".")
                if len(new_matching_ranks) > 1
                else f"¡Correcto! +{points:,} puntos".replace(",", ".")
            )
        else:
            game_round.misses += 1
            outcome = GuessOutcome.INCORRECT
            message = "No aparece entre las diez respuestas."

        guesses.append(
            {
                "normalized": normalized_guess,
                "outcome": outcome.value,
                "matched_ranks": new_matching_ranks,
                "points_awarded": points if new_matching_ranks else 0,
                "combo_count": len(new_matching_ranks),
            }
        )
        game_round.guesses = guesses
        self._finish_round_if_needed(game, game_round)
        self._append_round_summary(game, game_round, prompt, puzzle)
        game.version += 1
        game_round.version += 1
        game.updated_at = datetime.now(UTC)
        await session.commit()
        result = GuessResult(
            outcome=outcome,
            matched_ranks=new_matching_ranks,
            matched_rank=new_matching_ranks[0] if new_matching_ranks else None,
            points_awarded=points if new_matching_ranks else 0,
            combo_count=len(new_matching_ranks),
            match_kind=match_kind,
            message=message,
        )
        return self._state(game, game_round, puzzle, prompt, result)

    @serialized_game_mutation
    async def give_up(self, session: AsyncSession, game_id: str) -> GameState:
        game = await session.get(Game, game_id)
        if game is None:
            raise GameError("game_not_found", "La partida no existe.", 404)
        self._ensure_not_expired(game)
        if game.status != GameStatus.PLAYING.value:
            raise GameError("game_not_playing", "La ronda ya ha terminado.", 409)
        game_round, puzzle, prompt = await self._current_round(session, game)
        game_round.status = GameStatus.ROUND_COMPLETE.value
        game.status = (
            GameStatus.COMPLETE.value
            if game.mode != GameMode.RANDOM.value or game.round_number == game.total_rounds
            else GameStatus.ROUND_COMPLETE.value
        )
        game.updated_at = datetime.now(UTC)
        self._append_round_summary(game, game_round, prompt, puzzle)
        game.version += 1
        game_round.version += 1
        await session.commit()
        result = GuessResult(outcome=GuessOutcome.GAVE_UP, message="Respuestas reveladas.")
        return self._state(game, game_round, puzzle, prompt, result)

    @serialized_game_mutation
    async def next_round(self, session: AsyncSession, game_id: str) -> GameState:
        game = await session.get(Game, game_id)
        if game is None:
            raise GameError("game_not_found", "La partida no existe.", 404)
        self._ensure_not_expired(game)
        if game.mode != GameMode.RANDOM.value or game.status != GameStatus.ROUND_COMPLETE.value:
            raise GameError("next_round_unavailable", "No hay otra ronda disponible.", 409)
        game.round_number += 1
        planned_ids = list(game.planned_puzzle_ids or [])
        if len(planned_ids) < game.round_number:
            raise GameError("next_round_unavailable", "No hay otra ronda disponible.", 409)
        puzzle = await session.get(Puzzle, planned_ids[game.round_number - 1])
        if puzzle is None:
            raise GameError("puzzle_not_found", "La ronda no está disponible.", 404)
        new_round = GameRound(
            game_id=game.id,
            round_number=game.round_number,
            puzzle_id=puzzle.id,
            found_ranks=[],
            guesses=[],
            misses=0,
            score=0,
            status=GameStatus.PLAYING.value,
        )
        session.add(new_round)
        game.status = GameStatus.PLAYING.value
        game.version += 1
        game.updated_at = datetime.now(UTC)
        await session.commit()
        return await self.get_game(session, game.id)

    async def _daily_puzzle(self, session: AsyncSession, puzzle_date: date) -> Puzzle:
        existing = await session.scalar(select(Puzzle).where(Puzzle.puzzle_date == puzzle_date))
        if existing is not None:
            return existing
        raise GameError("puzzle_not_found", "Ese reto diario no está programado.", 404)

    async def _select_random_puzzles(
        self, session: AsyncSession, game: Game, recent_puzzle_ids: list[str]
    ) -> list[Puzzle]:
        """Pick and freeze all three rounds at game creation.

        Random games only consume approved, immutable snapshots. ``recent`` is
        the per-device shuffle bag supplied by the client; when a pool is
        exhausted the exclusions naturally fall away.
        """
        statement = (
            select(Puzzle, Prompt)
            .join(Prompt, Prompt.id == Puzzle.prompt_id)
            .where(
                Puzzle.puzzle_date.is_(None),
                Puzzle.random_eligible.is_(True),
                Puzzle.approval_status == "approved",
                Puzzle.content_version == CURRENT_CONTENT_VERSION,
            )
        )
        if game.selected_category and game.selected_category != "todas":
            statement = statement.where(Prompt.category == game.selected_category)
        rows = [row._tuple() for row in (await session.execute(statement)).all()]
        if not rows:
            raise GameError("no_prompts", "No hay tableros disponibles.", 503)
        recent = set(recent_puzzle_ids)
        fresh = [row for row in rows if row[0].id not in recent]
        pool = fresh or rows
        rng = random.SystemRandom()
        if game.selected_category == "todas":
            by_category: dict[str, list[tuple[Puzzle, Prompt]]] = {}
            for row in pool:
                by_category.setdefault(row[1].category, []).append(row)
            categories = list(by_category)
            rng.shuffle(categories)
            if len(categories) >= game.total_rounds:
                chosen: list[tuple[Puzzle, Prompt]] = []
                for category in categories:
                    rng.shuffle(by_category[category])
                    chosen.append(by_category[category][0])
                    if len(chosen) == game.total_rounds:
                        break
            else:
                rng.shuffle(pool)
                chosen = pool[: game.total_rounds]
        else:
            rng.shuffle(pool)
            chosen = pool[: game.total_rounds]
        if len(chosen) < game.total_rounds:
            raise GameError("no_prompts", "No hay tres tableros disponibles.", 503)
        return [row[0] for row in chosen]

    async def _answers_for(self, prompt: Prompt) -> tuple[list[str], str]:
        # Production play never calls the suggestions endpoint. Snapshots are
        # imported/reviewed ahead of time and are immutable once captured.
        if len(prompt.fallback_answers) != 10:
            raise GameError("suggestions_unavailable", "Las sugerencias no están disponibles.", 503)
        return list(prompt.fallback_answers), "snapshot"

    async def _current_round(
        self, session: AsyncSession, game: Game
    ) -> tuple[GameRound, Puzzle, Prompt]:
        statement = (
            select(GameRound, Puzzle, Prompt)
            .join(Puzzle, Puzzle.id == GameRound.puzzle_id)
            .join(Prompt, Prompt.id == Puzzle.prompt_id)
            .where(GameRound.game_id == game.id, GameRound.round_number == game.round_number)
        )
        row = (await session.execute(statement)).one_or_none()
        if row is None:
            raise GameError("round_not_found", "La ronda no existe.", 404)
        return row._tuple()

    def _state(
        self,
        game: Game,
        game_round: GameRound,
        puzzle: Puzzle,
        prompt: Prompt,
        last_result: GuessResult | None,
    ) -> GameState:
        reveal_all = game_round.status != GameStatus.PLAYING.value
        prompt_text = puzzle.prompt_text or prompt.text
        found = set(game_round.found_ranks)
        slots: list[AnswerSlot] = []
        for index, answer in enumerate(puzzle.answers, start=1):
            if index in found:
                status = SlotStatus.FOUND
            elif reveal_all:
                status = SlotStatus.REVEALED
            else:
                status = SlotStatus.HIDDEN
            slots.append(
                AnswerSlot(
                    rank=index,
                    points=self._points_for_rank(index),
                    status=status,
                    completion=self._completion(prompt_text, answer)
                    if status is not SlotStatus.HIDDEN
                    else None,
                )
            )
        puzzle_date = puzzle.puzzle_date
        summaries = [RoundSummary.model_validate(item) for item in (game.round_summaries or [])]
        return GameState(
            id=game.id,
            mode=GameMode(game.mode),
            puzzle_date=puzzle_date,
            puzzle_number=puzzle_number(puzzle_date) if puzzle_date else None,
            round_number=game.round_number,
            total_rounds=game.total_rounds,
            category=self._category(prompt.category),
            prompt=prompt_text,
            content_id=puzzle.id,
            content_version=puzzle.content_version,
            snapshot_source=puzzle.source,
            captured_at=puzzle.captured_at,
            score=game.score,
            round_score=game_round.score,
            misses=game_round.misses,
            misses_remaining=max(0, 4 - game_round.misses),
            status=GameStatus(game.status),
            slots=slots,
            round_summaries=summaries,
            last_result=last_result,
        )

    @staticmethod
    def _exact_ranks(prompt: str, answers: list[str], guess: str) -> list[int]:
        normalized_prompt = normalize_text(prompt)
        normalized_guess = normalize_text(guess)
        exact_matches: list[int] = []
        for rank, answer in enumerate(answers, start=1):
            normalized_answer = normalize_text(answer)
            suffix = normalized_answer.removeprefix(normalized_prompt).strip()
            if normalized_guess in {normalized_answer, suffix}:
                exact_matches.append(rank)
        return exact_matches

    def _classify_guess(
        self, prompt_text: str, prompt: Prompt, puzzle: Puzzle, normalized_guess: str
    ) -> tuple[list[int], MatchKind | None, bool]:
        exact = self._exact_ranks(prompt_text, puzzle.answers, normalized_guess)
        if exact:
            return exact, MatchKind.EXACT, False
        aliases = {normalize_text(key): values for key, values in (puzzle.aliases or {}).items()}
        configured = (prompt.match_config or {}).get("aliases", {})
        aliases.update({normalize_text(key): values for key, values in configured.items()})
        if normalized_guess in aliases:
            return sorted(set(aliases[normalized_guess])), MatchKind.ALIAS, False
        matches = self._matching_ranks(prompt_text, puzzle.answers, normalized_guess)
        blocked = {
            normalize_text(item) for item in (prompt.match_config or {}).get("blocked_guesses", [])
        }
        guess_tokens = [
            token
            for token in normalized_guess.split()
            if token not in self._GUESS_STOP_WORDS and len(token) >= 3
        ]
        broad = (
            normalized_guess == normalize_text(prompt_text)
            or normalized_guess in blocked
            or not guess_tokens
            or len(matches) >= 4
        )
        return matches, MatchKind.CONCEPT if matches else None, broad

    @staticmethod
    def _matching_ranks(prompt: str, answers: list[str], guess: str) -> list[int]:
        normalized_prompt = normalize_text(prompt)
        normalized_guess = normalize_text(guess)

        # Exact completion/full-query matches always win over concept matching.
        exact_matches = GameService._exact_ranks(prompt, answers, guess)
        if exact_matches:
            return exact_matches

        # A distinctive word (or group of words) from the missing part is
        # enough. Articles and other connector words alone are deliberately
        # ignored so guesses such as "el" cannot reveal an arbitrary answer.
        guess_tokens = [
            token
            for token in normalized_guess.split()
            if token not in GameService._GUESS_STOP_WORDS and len(token) >= 3
        ]
        if not guess_tokens:
            return []

        keyword_matches: list[int] = []
        for rank, answer in enumerate(answers, start=1):
            normalized_answer = normalize_text(answer)
            suffix_tokens = set(normalized_answer.removeprefix(normalized_prompt).strip().split())
            if all(token in suffix_tokens for token in guess_tokens):
                keyword_matches.append(rank)
        return keyword_matches

    @staticmethod
    def _matching_rank(prompt: str, answers: list[str], guess: str) -> int | None:
        """Return the first match for callers that only need one rank."""
        return next(iter(GameService._matching_ranks(prompt, answers, guess)), None)

    @staticmethod
    def _completion(prompt: str, answer: str) -> str:
        if normalize_text(answer).startswith(normalize_text(prompt)):
            return answer[len(prompt) :].strip() or answer
        return answer

    @staticmethod
    def _points_for_rank(rank: int) -> int:
        return (11 - rank) * 1_000

    @staticmethod
    def _category(slug: str) -> CategoryOut:
        return CategoryOut(slug=slug, name=CATEGORY_NAMES[slug])

    @staticmethod
    def _finish_round_if_needed(game: Game, game_round: GameRound) -> None:
        if len(game_round.found_ranks) < 10 and game_round.misses < 4:
            return
        game_round.status = GameStatus.ROUND_COMPLETE.value
        if game.mode != GameMode.RANDOM.value or game.round_number == game.total_rounds:
            game.status = GameStatus.COMPLETE.value
        else:
            game.status = GameStatus.ROUND_COMPLETE.value

    @staticmethod
    def _append_round_summary(
        game: Game, game_round: GameRound, prompt: Prompt, puzzle: Puzzle
    ) -> None:
        if game_round.status == GameStatus.PLAYING.value:
            return
        summaries = list(game.round_summaries or [])
        if any(item.get("round_number") == game_round.round_number for item in summaries):
            return
        summaries.append(
            {
                "round_number": game_round.round_number,
                "category": {"slug": prompt.category, "name": CATEGORY_NAMES[prompt.category]},
                "found": len(game_round.found_ranks),
                "score": game_round.score,
                "misses": game_round.misses,
                "puzzle_number": puzzle_number(puzzle.puzzle_date) if puzzle.puzzle_date else None,
            }
        )
        game.round_summaries = summaries

    @staticmethod
    def _ensure_not_expired(game: Game) -> None:
        expires_at = game.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at <= datetime.now(UTC):
            raise GameError("game_expired", "La partida ha caducado.", 410)
