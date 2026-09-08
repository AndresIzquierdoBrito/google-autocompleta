import AsyncStorage from "@react-native-async-storage/async-storage";

import type { GameState } from "@/api/types";

const PREFIX = "@google-autocompleta";

export type SavedSession = {
  gameId: string;
  completedState?: GameState;
};

export const sessionKey = {
  daily: (date?: string) =>
    date ? `${PREFIX}:session:daily:${date}` : `${PREFIX}:session:daily`,
  archive: (date: string) => `${PREFIX}:session:archive:${date}`,
  random: (category: string) => `${PREFIX}:session:random:${category}`,
};

export async function getSavedSession(
  key: string,
): Promise<SavedSession | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedSession;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

export async function saveSession(
  key: string,
  state: GameState,
): Promise<void> {
  const value: SavedSession = {
    gameId: state.id,
    completedState: state.status === "complete" ? state : undefined,
  };
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function clearSession(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

/** Copy the pre-date daily record forward only when it belongs to today. */
export async function migrateDailySession(date: string): Promise<void> {
  const currentKey = sessionKey.daily(date);
  if (await AsyncStorage.getItem(currentKey)) return;
  const legacy = await getSavedSession(sessionKey.daily());
  if (legacy?.completedState?.puzzle_date === date) {
    await AsyncStorage.setItem(currentKey, JSON.stringify(legacy));
  }
}

export async function getRandomBest(): Promise<number> {
  return Number(await AsyncStorage.getItem(`${PREFIX}:random-best`)) || 0;
}

export async function updateRandomBest(score: number): Promise<number> {
  const best = Math.max(await getRandomBest(), score);
  await AsyncStorage.setItem(`${PREFIX}:random-best`, String(best));
  return best;
}

export async function getCompletedArchiveDates(): Promise<Set<string>> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith(`${PREFIX}:session:archive:`),
  );
  const entries = await Promise.all(
    keys.map(
      async (key): Promise<[string, string | null]> => [
        key,
        await AsyncStorage.getItem(key),
      ],
    ),
  );
  return new Set(
    entries.flatMap(([key, raw]) => {
      if (!raw) return [];
      try {
        const saved = JSON.parse(raw) as SavedSession;
        return saved.completedState ? [key.split(":").at(-1) ?? ""] : [];
      } catch {
        return [];
      }
    }),
  );
}

export type StreakStats = { current: number; played: number };

export async function getStreakStats(): Promise<StreakStats> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith(`${PREFIX}:session:`),
  );
  const entries = await AsyncStorage.multiGet(keys);
  const dates = new Set<string>();
  for (const [, raw] of entries) {
    if (!raw) continue;
    try {
      const saved = JSON.parse(raw) as SavedSession;
      if (saved.completedState?.puzzle_date)
        dates.add(saved.completedState.puzzle_date);
    } catch {
      // Ignore an invalid local record; session recovery handles its own cleanup.
    }
  }

  const cursor = new Date();
  const today = cursor.toISOString().slice(0, 10);
  if (!dates.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let current = 0;
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    current += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { current, played: dates.size };
}
