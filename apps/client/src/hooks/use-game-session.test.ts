import { describe, expect, it } from "vitest";

import type { CreateGamePayload, GameState } from "@/api/types";
import { restoreOrCreateGame } from "@/hooks/session-recovery";

const randomPayload: CreateGamePayload = { mode: "random", category: "todas" };

function makeApiError(message: string, code: string, status: number): Error & {
  code: string;
  status: number;
} {
  return Object.assign(new Error(message), { code, status });
}

function makeGame(id: string): GameState {
  return {
    id,
    mode: "random",
    puzzle_date: null,
    puzzle_number: null,
    round_number: 1,
    total_rounds: 5,
    category: { slug: "comida", name: "Comida" },
    prompt: "qué cocinar con",
    score: 0,
    round_score: 0,
    misses: 0,
    misses_remaining: 4,
    status: "playing",
    slots: [],
    last_result: null,
  };
}

describe("restoreOrCreateGame", () => {
  it.each([404, 410])(
    "replaces a stale saved game after a %s response",
    async (status) => {
      const key = "@google-autocompleta:session:random:todas";
      const freshGame = makeGame("fresh-game");
      const clearedKeys: string[] = [];
      const savedGames: [string, GameState][] = [];
      let createdPayload: CreateGamePayload | undefined;

      const result = await restoreOrCreateGame(
        randomPayload,
        key,
        false,
        {
          getSavedSession: async () => ({ gameId: "stale-game" }),
          getGame: async () => {
            throw makeApiError("La partida no existe.", "game_not_found", status);
          },
          clearSession: async (sessionKey) => {
            clearedKeys.push(sessionKey);
          },
          createGame: async (payload) => {
            createdPayload = payload;
            return freshGame;
          },
          saveSession: async (sessionKey, game) => {
            savedGames.push([sessionKey, game]);
          },
        },
      );

      expect(result).toBe(freshGame);
      expect(clearedKeys).toEqual([key]);
      expect(createdPayload).toEqual(randomPayload);
      expect(savedGames).toEqual([[key, freshGame]]);
    },
  );

  it("does not replace a saved game for an unrelated API error", async () => {
    const error = makeApiError("Servicio no disponible.", "server_error", 503);
    const clearedKeys: string[] = [];
    let createCalls = 0;

    await expect(
      restoreOrCreateGame(
        randomPayload,
        "random-key",
        false,
        {
          getSavedSession: async () => ({ gameId: "saved-game" }),
          getGame: async () => {
            throw error;
          },
          clearSession: async (key) => {
            clearedKeys.push(key);
          },
          createGame: async () => {
            createCalls += 1;
            return makeGame("unexpected-game");
          },
          saveSession: async () => undefined,
        },
      ),
    ).rejects.toBe(error);

    expect(clearedKeys).toEqual([]);
    expect(createCalls).toBe(0);
  });

  it("propagates a fresh-game creation error", async () => {
    const error = makeApiError(
      "Las sugerencias no están disponibles.",
      "suggestions_unavailable",
      503,
    );

    await expect(
      restoreOrCreateGame(
        randomPayload,
        "random-key",
        false,
        {
          getSavedSession: async () => null,
          getGame: async () => makeGame("unexpected-game"),
          clearSession: async () => undefined,
          createGame: async () => {
            throw error;
          },
          saveSession: async () => undefined,
        },
      ),
    ).rejects.toBe(error);
  });
});
