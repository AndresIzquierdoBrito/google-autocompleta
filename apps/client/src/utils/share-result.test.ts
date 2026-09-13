import { describe, expect, it } from "vitest";

import type { GameState } from "@/api/types";
import { buildShareText, formatPoints } from "@/utils/share-result";

const expectedShareUrl =
  process.env.EXPO_PUBLIC_APP_URL ?? "https://google-autocompleta.app";

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

function makeRandomGame(): GameState {
  return {
    id: "random-game-1",
    mode: "random",
    puzzle_date: null,
    puzzle_number: null,
    round_number: 3,
    total_rounds: 3,
    category: { slug: "todas", name: "Todas" },
    prompt: "mi pareja no sabe que",
    score: 42_000,
    round_score: 10_000,
    misses: 1,
    misses_remaining: 3,
    status: "complete",
    slots: Array.from({ length: 10 }, (_, index) => ({
      rank: index + 1,
      points: (10 - index) * 1_000,
      status: "revealed" as const,
      completion: `respuesta secreta ${index + 1}`,
    })),
    round_summaries: [
      {
        round_number: 1,
        category: { slug: "cultura", name: "Cultura" },
        found: 3,
        score: 24_000,
        misses: 2,
        puzzle_number: 1,
      },
      {
        round_number: 2,
        category: { slug: "personas", name: "Personas" },
        found: 6,
        score: 8_000,
        misses: 3,
        puzzle_number: 31,
      },
      {
        round_number: 3,
        category: { slug: "comida", name: "Comida" },
        found: 10,
        score: 10_000,
        misses: 0,
        puzzle_number: 32,
      },
    ],
    last_result: null,
  };
}

describe("buildShareText", () => {
  it("creates a spoiler-free Wordle-style result", () => {
    const result = buildShareText(makeGame());
    expect(result).toContain("Google Autocompleta #14");
    expect(result).toContain("2/10 · 19.000 puntos · 2/4 fallos");
    expect(result).toContain("🟩🟩⬛⬛⬛⬛⬛⬛⬛⬛");
    expect(result).toContain(expectedShareUrl);
    expect(result).not.toContain("respuesta 1");
  });

  it("summarizes all completed random rounds without revealing answers", () => {
    const result = buildShareText(makeRandomGame());
    const lines = result.split("\n");

    expect(lines[0]).toBe("Google Autocompleta");
    expect(lines[1]).toBe("19/30 · 42.000 puntos · 1/4 fallos");
    expect(lines[2]).toBe("🟩🟩🟩⬛⬛⬛⬛⬛⬛⬛");
    expect(lines[3]).toBe("🟩🟩🟩🟩🟩🟩⬛⬛⬛⬛");
    expect(lines[4]).toBe("🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩");
    expect(result).toContain(expectedShareUrl);
    expect(result).not.toContain("respuesta secreta");
  });

  it("formats points for Spain", () => {
    expect(formatPoints(55_000)).toBe("55.000");
  });
});
