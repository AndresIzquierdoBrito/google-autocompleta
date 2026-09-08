import { describe, expect, it } from "vitest";

import type { GameState } from "@/api/types";
import { buildShareText, formatPoints } from "@/utils/share-result";

function makeGame(): GameState {
  return {
    id: "game-1",
    mode: "daily",
    puzzle_date: "2026-08-16",
    puzzle_number: 14,
    round_number: 1,
    total_rounds: 1,
    category: { slug: "comida", name: "Comida" },
    prompt: "se puede congelar",
    score: 19_000,
    round_score: 19_000,
    misses: 2,
    misses_remaining: 2,
    status: "complete",
    slots: Array.from({ length: 10 }, (_, index) => ({
      rank: index + 1,
      points: (10 - index) * 1_000,
      status: index < 2 ? ("found" as const) : ("revealed" as const),
      completion: index < 2 ? `respuesta ${index + 1}` : "oculta",
    })),
    last_result: null,
  };
}

describe("buildShareText", () => {
  it("creates a spoiler-free Wordle-style result", () => {
    const result = buildShareText(makeGame());
    expect(result).toContain("Google Autocompleta #14");
    expect(result).toContain("2/10 · 19.000 puntos · 2/4 fallos");
    expect(result).toContain("🟩🟩⬛⬛⬛⬛⬛⬛⬛⬛");
    expect(result).not.toContain("respuesta 1");
  });

  it("formats points for Spain", () => {
    expect(formatPoints(55_000)).toBe("55.000");
  });
});
