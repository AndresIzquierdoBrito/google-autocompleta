import type { CreateGamePayload, GameState } from "@/api/types";

type SavedSession = {
  gameId: string;
  completedState?: GameState;
};

export type SessionStartDependencies = {
  getSavedSession: (key: string) => Promise<SavedSession | null>;
  getGame: (gameId: string) => Promise<GameState>;
  clearSession: (key: string) => Promise<void>;
  createGame: (payload: CreateGamePayload) => Promise<GameState>;
  saveSession: (key: string, game: GameState) => Promise<void>;
};

function isStaleSessionError(error: unknown): boolean {
  if (!(error instanceof Error) || !("status" in error)) return false;
  const status = (error as Error & { status?: unknown }).status;
  return status === 404 || status === 410;
}

export async function restoreOrCreateGame(
  payload: CreateGamePayload,
  key: string,
  forceNew = false,
  dependencies: SessionStartDependencies,
): Promise<GameState> {
  if (!forceNew) {
    const saved = await dependencies.getSavedSession(key);
    if (saved?.completedState && payload.mode !== "random") {
      return saved.completedState;
    }
    if (saved?.gameId && !saved.completedState) {
      try {
        return await dependencies.getGame(saved.gameId);
      } catch (restoreError) {
        if (!isStaleSessionError(restoreError)) throw restoreError;
        // A server restart, cleanup, or session expiry can leave a local game
        // id that no longer exists. Treat both responses as a stale cache and
        // create a fresh game below.
        await dependencies.clearSession(key);
      }
    }
  } else {
    await dependencies.clearSession(key);
  }

  const created = await dependencies.createGame(payload);
  await dependencies.saveSession(key, created);
  return created;
}
