"""Versioned content catalog and deterministic Daily schedule."""

import json
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

CATEGORY_NAMES: dict[str, str] = {
    "cultura": "Cultura",
    "personas": "Personas",
    "nombres": "Nombres",
    "preguntas": "Preguntas",
    "animales": "Animales",
    "entretenimiento": "Entretenimiento",
    "comida": "Comida",
}

CURRENT_CONTENT_VERSION = "3"
# Keep the original epoch so old dated puzzles remain addressable in Histórico.
DAILY_EPOCH = date(2026, 8, 3)
V3_DAILY_EPOCH = date(2026, 9, 14)
V3_DAILY_DAYS = 35
V3_DAILY_END = V3_DAILY_EPOCH + timedelta(days=V3_DAILY_DAYS - 1)


@dataclass(frozen=True, slots=True)
class PromptSeed:
    id: str
    text: str
    endings: tuple[str, ...]
    content_version: str = CURRENT_CONTENT_VERSION
    eligibility: str = "random"
    aliases: dict[str, list[int]] | None = None
    source: str = "google-feud-localized"

    @property
    def category(self) -> str:
        return self.id.split("-", 2)[1]

    @property
    def answers(self) -> list[str]:
        return [f"{self.text} {ending}".strip() for ending in self.endings]


def _load_content() -> tuple[PromptSeed, ...]:
    path = Path(__file__).resolve().parents[2] / "content" / "boards-v3.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("content_version") != CURRENT_CONTENT_VERSION:
        raise RuntimeError("The bundled content pack is not version 3.")
    seeds: list[PromptSeed] = []
    for board in raw["boards"]:
        source: dict[str, Any] = board.get("source", {})
        seeds.append(
            PromptSeed(
                id=board["id"],
                text=board["prompt"],
                endings=tuple(board["completions"]),
                content_version=raw["content_version"],
                eligibility=board["eligibility"],
                aliases=board.get("aliases") or {},
                source=str(source.get("kind", "google-feud-localized")),
            )
        )
    return tuple(seeds)


PROMPT_SEEDS: tuple[PromptSeed, ...] = _load_content()
PROMPTS_BY_ID = {prompt.id: prompt for prompt in PROMPT_SEEDS}


def seeded_daily_prompts() -> list[tuple[date, PromptSeed]]:
    """Return the 35 pre-scheduled v3 Daily snapshots in category rotation."""

    by_category = {
        category: [
            prompt
            for prompt in PROMPT_SEEDS
            if prompt.category == category and prompt.eligibility == "daily"
        ]
        for category in CATEGORY_NAMES
    }
    if any(len(prompts) != 5 for prompts in by_category.values()):
        raise RuntimeError("Content pack must contain five Daily boards per category.")

    scheduled: list[tuple[date, PromptSeed]] = []
    for round_number in range(5):
        for category_index, category in enumerate(CATEGORY_NAMES):
            puzzle_date = V3_DAILY_EPOCH + timedelta(days=round_number * 7 + category_index)
            scheduled.append((puzzle_date, by_category[category][round_number]))
    return scheduled


def legacy_daily_prompts() -> list[tuple[date, PromptSeed]]:
    """Keep a readable archive baseline when bootstrapping a new database."""

    return [(DAILY_EPOCH + timedelta(days=offset), PROMPT_SEEDS[offset]) for offset in range(35)]


def puzzle_number(puzzle_date: date) -> int:
    return (puzzle_date - DAILY_EPOCH).days + 1
