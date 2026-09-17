import AsyncStorage from "@react-native-async-storage/async-storage";

import type { GameState } from "@/api/types";

const PREFIX = "@google-autocompleta";
const DAILY_HISTORY_PREFIX = `${PREFIX}:daily-history:`;
const LEGACY_DAILY_SESSION_PREFIX = `${PREFIX}:session:daily:`;

export type SavedSession = {
  gameId: string;
  completedState?: GameState;
};

export type DailyHistory = {
  completedDates: Set<string>;
  ledgerDates: Set<string>;
};

type DailyHistoryRecord = {
  date: string;
  completedAt: string;
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

  // Before dated sessions were introduced, daily completions were stored as
  // `session:daily:YYYY-MM-DD`. Preserve those records when a user returns.
  const legacyDated = await getSavedSession(`${LEGACY_DAILY_SESSION_PREFIX}${date}`);
  if (isCompletedDailySession(legacyDated, date)) {
    await AsyncStorage.setItem(currentKey, JSON.stringify(legacyDated));
    return;
  }

  const legacy = await getSavedSession(sessionKey.daily());
  if (isCompletedDailySession(legacy, date)) {
    await AsyncStorage.setItem(currentKey, JSON.stringify(legacy));
  }
}

function isPuzzleDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isCompletedDailySession(
  saved: SavedSession | null,
  date?: string,
): boolean {
  const completed = saved?.completedState;
  return (
    completed?.mode === "daily" &&
    completed.status === "complete" &&
    isPuzzleDate(completed.puzzle_date) &&
    (date === undefined || completed.puzzle_date === date)
  );
}

function readDailySessionDate(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as SavedSession;
    return isCompletedDailySession(saved) ? saved.completedState!.puzzle_date : null;
  } catch {
    return null;
  }
}

function readDailyLedgerDate(
  key: string,
  raw: string | null,
): string | null {
  if (!raw) return null;
  const date = key.slice(DAILY_HISTORY_PREFIX.length);
  if (!isPuzzleDate(date)) return null;
  try {
    const record = JSON.parse(raw) as Partial<DailyHistoryRecord>;
    return record.date === date ? date : null;
  } catch {
    return null;
  }
}

export async function getDailyHistory(): Promise<DailyHistory> {
  const keys = await AsyncStorage.getAllKeys();
  const sessionKeys = keys.filter((key) =>
    key.startsWith(`${PREFIX}:session:`),
  );
  const ledgerKeys = keys.filter((key) =>
    key.startsWith(DAILY_HISTORY_PREFIX),
  );
  const entries = await AsyncStorage.multiGet([...sessionKeys, ...ledgerKeys]);
  const completedDates = new Set<string>();
  const ledgerDates = new Set<string>();

  for (const [key, raw] of entries) {
    if (key.startsWith(DAILY_HISTORY_PREFIX)) {
      const date = readDailyLedgerDate(key, raw);
      if (date) {
        completedDates.add(date);
        ledgerDates.add(date);
      }
      continue;
    }
    const date = readDailySessionDate(raw);
    if (date) completedDates.add(date);
  }

  return { completedDates, ledgerDates };
}

async function migrateDailyHistory(history: DailyHistory): Promise<DailyHistory> {
  const missingDates = [...history.completedDates].filter(
    (date) => !history.ledgerDates.has(date),
  );
  if (missingDates.length === 0) return history;

  const completedAt = new Date().toISOString();
  await AsyncStorage.multiSet(
    missingDates.map((date) => [
      `${DAILY_HISTORY_PREFIX}${date}`,
      JSON.stringify({ date, completedAt } satisfies DailyHistoryRecord),
    ]),
  );
  return {
    completedDates: history.completedDates,
    ledgerDates: new Set([...history.ledgerDates, ...missingDates]),
  };
}

export async function recordDailyCompletion(date: string): Promise<void> {
  if (!isPuzzleDate(date)) return;
  await AsyncStorage.setItem(
    `${DAILY_HISTORY_PREFIX}${date}`,
    JSON.stringify({
      date,
      completedAt: new Date().toISOString(),
    } satisfies DailyHistoryRecord),
  );
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

export function calculateStreak(
  completedDates: Iterable<string>,
  canonicalToday: string,
): StreakStats {
  if (!isPuzzleDate(canonicalToday)) {
    throw new Error("Invalid canonical daily date.");
  }

  // Future records cannot be produced by the API, but ignoring them keeps a
  // malformed or clock-skewed local record from affecting the visible stats.
  const dates = new Set(
    [...completedDates].filter(
      (date): date is string => isPuzzleDate(date) && date <= canonicalToday,
    ),
  );
  const cursor = new Date(`${canonicalToday}T12:00:00Z`);
  if (!dates.has(canonicalToday)) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let current = 0;
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    current += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { current, played: dates.size };
}

function getLocalCalendarDate(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export async function getStreakStats(
  canonicalToday?: string,
  timezone = "Europe/Madrid",
): Promise<StreakStats> {
  const history = await getDailyHistory();
  const today = canonicalToday ?? getLocalCalendarDate(timezone);
  // A migration write is best effort. The already-read history is still
  // trustworthy, so a quota or transient write failure must not hide it.
  try {
    await migrateDailyHistory(history);
  } catch {
    // Retry the migration on the next read.
  }
  return calculateStreak(history.completedDates, today);
}
