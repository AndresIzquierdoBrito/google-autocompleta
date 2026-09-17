import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  calculateStreak,
  getDailyHistory,
  getStreakStats,
  migrateDailySession,
  recordDailyCompletion,
  sessionKey,
} from "@/storage/game-storage";

const storage = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      values.delete(key);
    }),
    getAllKeys: vi.fn(async () => [...values.keys()]),
    multiGet: vi.fn(async (keys: string[]) =>
      keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]),
    ),
    multiSet: vi.fn(async (pairs: [string, string][]) => {
      for (const [key, value] of pairs) values.set(key, value);
    }),
  };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: storage,
}));

const PREFIX = "@google-autocompleta";

function saveSession(
  key: string,
  mode: "daily" | "archive" | "random",
  date: string | null,
  status: "complete" | "playing" = "complete",
) {
  storage.values.set(
    key,
    JSON.stringify({
      gameId: `${mode}-${date ?? "random"}`,
      completedState: {
        mode,
        puzzle_date: date,
        status,
      },
    }),
  );
}

describe("calculateStreak", () => {
  it("counts consecutive dates through today", () => {
    expect(
      calculateStreak(
        ["2026-09-14", "2026-09-16", "2026-09-15", "2026-09-15"],
        "2026-09-16",
      ),
    ).toEqual({ current: 3, played: 3 });
  });

  it("continues from yesterday when today is not complete", () => {
    expect(calculateStreak(["2026-09-14", "2026-09-15"], "2026-09-16")).toEqual({
      current: 2,
      played: 2,
    });
  });

  it("stops at a missing day and ignores future or malformed dates", () => {
    expect(
      calculateStreak(
        ["2026-09-12", "2026-09-14", "2026-09-16", "2026-09-17", "not-a-date"],
        "2026-09-16",
      ),
    ).toEqual({ current: 1, played: 3 });
  });

  it("rejects an invalid canonical date instead of returning a false zero", () => {
    expect(() => calculateStreak([], "2026-02-30")).toThrow(
      "Invalid canonical daily date.",
    );
  });
});

describe("daily history persistence", () => {
  beforeEach(() => {
    storage.values.clear();
    vi.clearAllMocks();
  });

  it("records a completion in a date-keyed ledger", async () => {
    await recordDailyCompletion("2026-09-16");

    expect([...storage.values.keys()]).toEqual([
      `${PREFIX}:daily-history:2026-09-16`,
    ]);
    expect(await getStreakStats("2026-09-16")).toEqual({
      current: 1,
      played: 1,
    });
  });

  it("migrates legacy, dated, and no-date daily sessions without counting other modes", async () => {
    saveSession(
      `${PREFIX}:session:daily:2026-09-14`,
      "daily",
      "2026-09-14",
    );
    saveSession(
      `${PREFIX}:session:dated:2026-09-15`,
      "daily",
      "2026-09-15",
    );
    saveSession(`${PREFIX}:session:daily`, "daily", "2026-09-13");
    saveSession(
      `${PREFIX}:session:dated:2026-09-12`,
      "archive",
      "2026-09-12",
    );
    saveSession(`${PREFIX}:session:random:todas`, "random", null);
    saveSession(
      `${PREFIX}:session:dated:2026-09-11`,
      "daily",
      "2026-09-11",
      "playing",
    );

    expect(await getStreakStats("2026-09-16")).toEqual({
      current: 3,
      played: 3,
    });
    expect(storage.values.has(`${PREFIX}:daily-history:2026-09-13`)).toBe(true);
    expect(storage.values.has(`${PREFIX}:daily-history:2026-09-14`)).toBe(true);
    expect(storage.values.has(`${PREFIX}:daily-history:2026-09-15`)).toBe(true);
    expect(storage.values.has(`${PREFIX}:daily-history:2026-09-12`)).toBe(false);
  });

  it("does not discard valid history when a record is corrupt", async () => {
    storage.values.set(`${PREFIX}:daily-history:2026-09-15`, "{bad json");
    saveSession(
      `${PREFIX}:session:dated:2026-09-14`,
      "daily",
      "2026-09-14",
    );

    expect(await getStreakStats("2026-09-16")).toEqual({
      current: 0,
      played: 1,
    });
  });

  it("propagates storage failures so the UI can retain its last value", async () => {
    storage.getAllKeys.mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(getDailyHistory()).rejects.toThrow("storage unavailable");
  });

  it("still calculates existing history when the migration write is unavailable", async () => {
    saveSession(
      `${PREFIX}:session:dated:2026-09-15`,
      "daily",
      "2026-09-15",
    );
    storage.multiSet.mockRejectedValueOnce(new Error("quota exceeded"));

    expect(await getStreakStats("2026-09-16")).toEqual({
      current: 1,
      played: 1,
    });
  });

  it("migrates a legacy dated session when opening that daily", async () => {
    saveSession(
      `${PREFIX}:session:daily:2026-09-14`,
      "daily",
      "2026-09-14",
    );

    await migrateDailySession("2026-09-14");

    expect(storage.values.get(sessionKey.daily("2026-09-14"))).toBe(
      storage.values.get(`${PREFIX}:session:daily:2026-09-14`),
    );
  });
});
