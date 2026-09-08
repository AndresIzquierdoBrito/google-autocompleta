from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from google_autocompleta.database import Base


class Prompt(Base):
    __tablename__ = "prompts"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    category: Mapped[str] = mapped_column(String(32), index=True)
    text: Mapped[str] = mapped_column(String(160))
    fallback_answers: Mapped[list[str]] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(default=True)


class Puzzle(Base):
    __tablename__ = "puzzles"
    __table_args__ = (
        Index("idx_puzzles_prompt_captured", "prompt_id", "captured_at"),
        Index(
            "idx_puzzles_daily_date",
            "puzzle_date",
            unique=True,
            sqlite_where=text("puzzle_date IS NOT NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    prompt_id: Mapped[str] = mapped_column(ForeignKey("prompts.id", ondelete="RESTRICT"))
    puzzle_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    answers: Mapped[list[str]] = mapped_column(JSON)
    source: Mapped[str] = mapped_column(String(24))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Game(Base):
    __tablename__ = "games"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    mode: Mapped[str] = mapped_column(String(16), index=True)
    selected_category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    requested_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    round_number: Mapped[int] = mapped_column(Integer, default=1)
    total_rounds: Mapped[int] = mapped_column(Integer)
    score: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="playing")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class GameRound(Base):
    __tablename__ = "game_rounds"
    __table_args__ = (UniqueConstraint("game_id", "round_number", name="uq_game_round"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), index=True)
    round_number: Mapped[int] = mapped_column(Integer)
    puzzle_id: Mapped[str] = mapped_column(ForeignKey("puzzles.id", ondelete="RESTRICT"))
    found_ranks: Mapped[list[int]] = mapped_column(JSON, default=list)
    guesses: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    misses: Mapped[int] = mapped_column(Integer, default=0)
    score: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="playing")
