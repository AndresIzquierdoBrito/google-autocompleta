from __future__ import annotations

from datetime import date as Date
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


class GuessResult(BaseModel):
    outcome: str
    matched_rank: int | None = None
    message: str


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
    score: int
    round_score: int
    misses: int
    misses_remaining: int
    status: GameStatus
    slots: list[AnswerSlot]
    last_result: GuessResult | None = None


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
