import AsyncStorage from "@react-native-async-storage/async-storage";

import type { GameState } from "@/api/types";

const PREFIX = "@google-autocompleta";

export type SavedSession = {
  gameId: string;
  completedState?: GameState;
};

export const sessionKey = {
  // Daily and archive attempts for a date intentionally share one key.
  dated: (date: string) => `${PREFIX}:session:dated:${date}`,
  daily: (date?: string) =>
    date ? `${PREFIX}:session:dated:${date}` : `${PREFIX}:session:daily`,
  archive: (date: string) => `${PREFIX}:session:dated:${date}`,
  random: (category: string) => `${PREFIX}:session:random:${category}`,
};

const RANDOM_BAG_PREFIX = `${PREFIX}:shuffle-bag:`;

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

export async function getRecentRandomPuzzleIds(category: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(`${RANDOM_BAG_PREFIX}${category}`);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    await AsyncStorage.removeItem(`${RANDOM_BAG_PREFIX}${category}`);
    return [];
  }
}

export async function recordRandomPuzzle(
  category: string,
  puzzleId: string,
): Promise<void> {
  const current = await getRecentRandomPuzzleIds(category);
  const next = [...current.filter((id) => id !== puzzleId), puzzleId].slice(-175);
  await AsyncStorage.setItem(`${RANDOM_BAG_PREFIX}${category}`, JSON.stringify(next));
}

export async function getRandomBest(
  category = "todas",
  totalRounds = 3,
  contentVersion = "2",
): Promise<number> {
  return (
    Number(
      await AsyncStorage.getItem(
        `${PREFIX}:random-best:${category}:${totalRounds}:${contentVersion}`,
      ),
    ) || 0
  );
}

export async function updateRandomBest(
  score: number,
  category = "todas",
  totalRounds = 3,
  contentVersion = "2",
): Promise<number> {
  const best = Math.max(await getRandomBest(category, totalRounds, contentVersion), score);
  await AsyncStorage.setItem(
    `${PREFIX}:random-best:${category}:${totalRounds}:${contentVersion}`,
    String(best),
  );
  return best;
}

export async function getCompletedArchiveDates(): Promise<Set<string>> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith(`${PREFIX}:session:dated:`),
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
        return saved.completedState?.mode === "archive"
          ? [key.split(":").at(-1) ?? ""]
          : [];
      } catch {
        return [];
      }
    }),
  );
}

export type StreakStats = { current: number; played: number };

export async function getStreakStats(
  canonicalToday?: string,
  timezone = "Europe/Madrid",
): Promise<StreakStats> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith(`${PREFIX}:session:`),
  );
  const entries = await AsyncStorage.multiGet(keys);
  const dates = new Set<string>();
  for (const [, raw] of entries) {
    if (!raw) continue;
    try {
      const saved = JSON.parse(raw) as SavedSession;
      if (
        saved.completedState?.mode === "daily" &&
        saved.completedState.puzzle_date
      )
        dates.add(saved.completedState.puzzle_date);
    } catch {
      // Ignore an invalid local record; session recovery handles its own cleanup.
    }
  }

  const today =
    canonicalToday ??
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const cursor = new Date(`${today}T12:00:00Z`);
  if (!dates.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let current = 0;
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    current += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { current, played: dates.size };
}
