import asyncio
import random
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import Select, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from google_autocompleta.config import Settings
from google_autocompleta.data import CATEGORY_NAMES, DAILY_EPOCH, puzzle_number
from google_autocompleta.models import Game, GameRound, Prompt, Puzzle
from google_autocompleta.providers import GoogleSuggestProvider, SuggestionError
from google_autocompleta.providers.suggestions import normalize_text
from google_autocompleta.schemas import (
    AnswerSlot,
    ArchivePuzzleOut,
    CategoryOut,
    CreateGameRequest,
    GameMode,
    GameState,
    GameStatus,
    GuessResult,
    SlotStatus,
)


class GameError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


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

    def today(self) -> date:
        return datetime.now(ZoneInfo(self.settings.daily_timezone)).date()

    async def ensure_daily_puzzle(
        self, session: AsyncSession, puzzle_date: date | None = None
    ) -> Puzzle:
        """Ensure a durable puzzle exists for a daily date.

        The date is selected in the configured local timezone.  The per-process
        lock prevents duplicate provider requests when startup, the scheduler,
        and a player all arrive together; the database unique index remains the
        final authority when multiple API workers are running.
        """
        return await self._daily_puzzle(session, puzzle_date or self.today())

    async def current_daily(self, session: AsyncSession) -> tuple[date, int, str]:
        current = self.today()
        await self.ensure_daily_puzzle(session, current)
        await session.commit()
        return current, puzzle_number(current), self.settings.daily_timezone

    async def list_archive(self, session: AsyncSession) -> list[ArchivePuzzleOut]:
        # The scheduler covers normal operation, while this makes archive
        # requests self-healing after downtime or a failed scheduled run.
        await self.ensure_daily_puzzle(session)
        await session.commit()
        statement = (
            select(Puzzle, Prompt)
            .join(Prompt, Prompt.id == Puzzle.prompt_id)
            .where(Puzzle.puzzle_date.is_not(None), Puzzle.puzzle_date <= self.today())
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
            total_rounds=5 if request.mode is GameMode.RANDOM else 1,
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
        else:
            puzzle = await self._random_puzzle(session, game)
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

    async def submit_guess(self, session: AsyncSession, game_id: str, raw_guess: str) -> GameState:
        game = await session.get(Game, game_id)
        if game is None:
            raise GameError("game_not_found", "La partida no existe.", 404)
        self._ensure_not_expired(game)
        if game.status != GameStatus.PLAYING.value:
            raise GameError("game_not_playing", "La ronda ya ha terminado.", 409)

        game_round, puzzle, prompt = await self._current_round(session, game)
        normalized_guess = normalize_text(raw_guess)
        if not normalized_guess:
            raise GameError("empty_guess", "Escribe una respuesta antes de probar.")
        guesses = list(game_round.guesses)
        matching_ranks = self._matching_ranks(prompt.text, puzzle.answers, normalized_guess)
        new_matching_ranks = [rank for rank in matching_ranks if rank not in game_round.found_ranks]
        if any(item["normalized"] == normalized_guess for item in guesses) or (
            matching_ranks and not new_matching_ranks
        ):
            result = GuessResult(outcome="duplicate", message="Ya habías probado esa respuesta.")
            return self._state(game, game_round, puzzle, prompt, result)

        found_ranks = list(game_round.found_ranks)
        if new_matching_ranks:
            found_ranks.extend(new_matching_ranks)
            found_ranks.sort()
            points = sum(self._points_for_rank(rank) for rank in new_matching_ranks)
            game_round.found_ranks = found_ranks
            game_round.score += points
            game.score += points
            outcome = "correct"
            message = f"¡Correcto! +{points:,} puntos".replace(",", ".")
        else:
            game_round.misses += 1
            outcome = "incorrect"
            message = "No aparece entre las diez respuestas."

        guesses.append({"normalized": normalized_guess, "outcome": outcome})
        game_round.guesses = guesses
        self._finish_round_if_needed(game, game_round)
        game.updated_at = datetime.now(UTC)
        await session.commit()
        result = GuessResult(
            outcome=outcome,
            matched_rank=new_matching_ranks[0] if new_matching_ranks else None,
            message=message,
        )
        return self._state(game, game_round, puzzle, prompt, result)

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
        await session.commit()
        result = GuessResult(outcome="gave_up", message="Respuestas reveladas.")
        return self._state(game, game_round, puzzle, prompt, result)

    async def next_round(self, session: AsyncSession, game_id: str) -> GameState:
        game = await session.get(Game, game_id)
        if game is None:
            raise GameError("game_not_found", "La partida no existe.", 404)
        self._ensure_not_expired(game)
        if game.mode != GameMode.RANDOM.value or game.status != GameStatus.ROUND_COMPLETE.value:
            raise GameError("next_round_unavailable", "No hay otra ronda disponible.", 409)
        game.round_number += 1
        puzzle = await self._random_puzzle(session, game)
        session.add(
            GameRound(
                game_id=game.id,
                round_number=game.round_number,
                puzzle_id=puzzle.id,
                found_ranks=[],
                guesses=[],
                misses=0,
                score=0,
                status=GameStatus.PLAYING.value,
            )
        )
        game.status = GameStatus.PLAYING.value
        game.updated_at = datetime.now(UTC)
        await session.commit()
        return await self.get_game(session, game.id)

    async def _daily_puzzle(self, session: AsyncSession, puzzle_date: date) -> Puzzle:
        existing = await session.scalar(select(Puzzle).where(Puzzle.puzzle_date == puzzle_date))
        if existing is not None:
            return existing
        lock = self._daily_locks.setdefault(puzzle_date, asyncio.Lock())
        async with lock:
            locked_existing: Puzzle | None = await session.scalar(
                select(Puzzle).where(Puzzle.puzzle_date == puzzle_date)
            )
            if locked_existing is not None:
                return locked_existing
            prompts = list(
                (await session.scalars(select(Prompt).where(Prompt.is_active.is_(True)))).all()
            )
            if not prompts:
                raise GameError("no_prompts", "No hay preguntas disponibles.", 503)
            prompt = prompts[(puzzle_date - DAILY_EPOCH).days % len(prompts)]
            answers, source = await self._answers_for(prompt)
            puzzle = Puzzle(
                id=str(uuid4()),
                prompt_id=prompt.id,
                puzzle_date=puzzle_date,
                answers=answers,
                source=source,
                captured_at=datetime.now(UTC),
                expires_at=None,
            )
            try:
                async with session.begin_nested():
                    session.add(puzzle)
                    await session.flush()
            except IntegrityError:
                # Another worker may have won the unique daily-date insert
                # between our read and write. The savepoint keeps any caller's
                # pending game intact; use the durable winner.
                existing_after_race = await session.scalar(
                    select(Puzzle).where(Puzzle.puzzle_date == puzzle_date)
                )
                if existing_after_race is not None:
                    return existing_after_race
                raise
            return puzzle

    async def _random_puzzle(self, session: AsyncSession, game: Game) -> Puzzle:
        used_prompt_ids = set(
            (
                await session.scalars(
                    select(Puzzle.prompt_id)
                    .join(GameRound, GameRound.puzzle_id == Puzzle.id)
                    .where(GameRound.game_id == game.id)
                )
            ).all()
        )
        statement: Select[tuple[Prompt]] = select(Prompt).where(
            Prompt.is_active.is_(True), Prompt.id.not_in(used_prompt_ids)
        )
        if game.selected_category and game.selected_category != "todas":
            statement = statement.where(Prompt.category == game.selected_category)
        candidates = list((await session.scalars(statement)).all())
        random.SystemRandom().shuffle(candidates)
        if not candidates:
            raise GameError("no_prompts", "No quedan preguntas para esta partida.", 503)

        prompt = candidates[0]
        now = datetime.now(UTC)
        cached = await session.scalar(
            select(Puzzle)
            .where(
                Puzzle.prompt_id == prompt.id,
                Puzzle.puzzle_date.is_(None),
                Puzzle.expires_at > now,
            )
            .order_by(Puzzle.captured_at.desc())
        )
        if cached is not None:
            return cached
        answers, source = await self._answers_for(prompt)
        puzzle = Puzzle(
            id=str(uuid4()),
            prompt_id=prompt.id,
            puzzle_date=None,
            answers=answers,
            source=source,
            captured_at=now,
            expires_at=now + timedelta(seconds=self.settings.suggestion_cache_seconds),
        )
        session.add(puzzle)
        await session.flush()
        return puzzle

    async def _answers_for(self, prompt: Prompt) -> tuple[list[str], str]:
        try:
            return await self.provider.fetch(prompt.text), "google"
        except SuggestionError:
            if len(prompt.fallback_answers) != 10:
                raise GameError(
                    "suggestions_unavailable", "Las sugerencias no están disponibles.", 503
                ) from None
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
                    completion=self._completion(prompt.text, answer)
                    if status is not SlotStatus.HIDDEN
                    else None,
                )
            )
        puzzle_date = puzzle.puzzle_date
        return GameState(
            id=game.id,
            mode=GameMode(game.mode),
            puzzle_date=puzzle_date,
            puzzle_number=puzzle_number(puzzle_date) if puzzle_date else None,
            round_number=game.round_number,
            total_rounds=game.total_rounds,
            category=self._category(prompt.category),
            prompt=prompt.text,
            score=game.score,
            round_score=game_round.score,
            misses=game_round.misses,
            misses_remaining=max(0, 4 - game_round.misses),
            status=GameStatus(game.status),
            slots=slots,
            last_result=last_result,
        )

    @staticmethod
    def _matching_ranks(prompt: str, answers: list[str], guess: str) -> list[int]:
        normalized_prompt = normalize_text(prompt)
        normalized_guess = normalize_text(guess)

        # Prefer an exact suffix or full-query match before applying the more
        # forgiving keyword match below. Return every match because one guess
        # can legitimately complete more than one suggested search.
        exact_matches: list[int] = []
        for rank, answer in enumerate(answers, start=1):
            normalized_answer = normalize_text(answer)
            suffix = normalized_answer.removeprefix(normalized_prompt).strip()
            if normalized_guess in {normalized_answer, suffix}:
                exact_matches.append(rank)
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
    def _ensure_not_expired(game: Game) -> None:
        expires_at = game.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at <= datetime.now(UTC):
            raise GameError("game_expired", "La partida ha caducado.", 410)
