from __future__ import annotations

from datetime import date as Date
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class GameMode(StrEnum):
    DAILY = "daily"
    ARCHIVE = "archive"
    RANDOM = "random"


class GameStatus(StrEnum):
    PLAYING = "playing"
    ROUND_COMPLETE = "round_complete"
    COMPLETE = "complete"


class SlotStatus(StrEnum):
    HIDDEN = "hidden"
    FOUND = "found"
    REVEALED = "revealed"


class GuessOutcome(StrEnum):
    CORRECT = "correct"
    INCORRECT = "incorrect"
    DUPLICATE = "duplicate"
    TOO_BROAD = "too_broad"
    GAVE_UP = "gave_up"


class MatchKind(StrEnum):
    EXACT = "exact"
    ALIAS = "alias"
    CONCEPT = "concept"


class CategoryOut(BaseModel):
    slug: str
    name: str


class ArchivePuzzleOut(BaseModel):
    date: Date
    number: int
    category: CategoryOut
    prompt: str


class DailyCurrentOut(BaseModel):
    date: Date
    number: int
    timezone: str


class CreateGameRequest(BaseModel):
    mode: GameMode
    date: Date | None = None
    category: str | None = None
    recent_puzzle_ids: list[str] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_mode_fields(self) -> CreateGameRequest:
        if self.mode is GameMode.ARCHIVE and self.date is None:
            raise ValueError("El modo histórico necesita una fecha.")
        if self.mode is GameMode.RANDOM and self.date is not None:
            raise ValueError("El modo aleatorio no admite fecha.")
        return self


class GuessRequest(BaseModel):
    guess: str = Field(min_length=1, max_length=80)


class AnswerSlot(BaseModel):
    rank: int
    points: int
    status: SlotStatus
    completion: str | None = None
    # Safe hint for the hidden answer's approximate visual length; the answer
    # itself remains server-side until the slot is found or revealed.
    answer_length: int = Field(default=0, ge=0, le=160)


class GuessResult(BaseModel):
    outcome: GuessOutcome
    matched_ranks: list[int] = Field(default_factory=list)
    matched_rank: int | None = None
    points_awarded: int = 0
    combo_count: int = 0
    match_kind: MatchKind | None = None
    message: str


class RoundSummary(BaseModel):
    round_number: int
    category: CategoryOut
    found: int
    score: int
    misses: int
    puzzle_number: int | None = None


class GameState(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    mode: GameMode
    puzzle_date: Date | None
    puzzle_number: int | None
    round_number: int
    total_rounds: int
    category: CategoryOut
    prompt: str
    content_id: str
    content_version: str
    snapshot_source: str
    captured_at: datetime | None = None
    score: int
    round_score: int
    misses: int
    misses_remaining: int
    status: GameStatus
    slots: list[AnswerSlot]
    round_summaries: list[RoundSummary] = Field(default_factory=list)
    last_result: GuessResult | None = None


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
