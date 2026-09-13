import Constants from "expo-constants";
import { Platform } from "react-native";

import type {
  ArchivePuzzle,
  Category,
  CreateGamePayload,
  GameState,
} from "./types";

export type DailyCurrent = {
  date: string;
  number: number;
  timezone: string;
};

function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const browserHost = window.location.hostname;
    if (isLocalDevelopmentHost(browserHost)) {
      if (configured) {
        try {
          const configuredUrl = new URL(configured);
          if (isLocalDevelopmentHost(configuredUrl.hostname)) {
            return `${configuredUrl.protocol}//${browserHost}:${configuredUrl.port || "8000"}`;
          }
        } catch {
          // Fall through to the browser-host default below.
        }
      }
      return `http://${browserHost}:8000`;
    }
    // Production web deployments serve the API behind the same reverse proxy
    // as the static client. Keeping this relative to the current origin lets
    // one image move from Coolify's temporary sslip.io URL to the final
    // custom domain without a rebuild.
    if (!configured) return window.location.origin;
  }
  if (configured) return configured;
  if (Platform.OS !== "web") {
    const host = Constants.expoConfig?.hostUri?.split(":")[0];
    if (host) return `http://${host}:8000`;
  }
  return "http://localhost:8000";
}

function isLocalDevelopmentHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code = "request_failed",
    public readonly status = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ErrorPayload = { error?: { code?: string; message?: string } };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    response = await fetch(`${resolveApiUrl()}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (caught) {
    if (caught instanceof Error && caught.name === "AbortError") {
      throw new ApiError("La conexión está tardando demasiado. Inténtalo de nuevo.", "timeout");
    }
    throw new ApiError("No hemos podido conectar con el juego.");
  } finally {
    clearTimeout(timeout);
  }

  const payload = (await response.json().catch(() => undefined)) as
    | (T & ErrorPayload)
    | undefined;
  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message ?? "No hemos podido conectar con el juego.",
      payload?.error?.code,
      response.status,
    );
  }
  return payload as T;
}

export async function listCategories(): Promise<Category[]> {
  return request<Category[]>("/api/v1/categories");
}

export async function listArchive(): Promise<ArchivePuzzle[]> {
  return request<ArchivePuzzle[]>("/api/v1/daily/archive");
}

export async function getCurrentDaily(): Promise<DailyCurrent> {
  return request<DailyCurrent>("/api/v1/daily/current");
}

export async function createGame(body: CreateGamePayload): Promise<GameState> {
  return request<GameState>("/api/v1/games", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getGame(gameId: string): Promise<GameState> {
  return request<GameState>(`/api/v1/games/${encodeURIComponent(gameId)}`);
}

export async function submitGuess(
  gameId: string,
  guess: string,
): Promise<GameState> {
  return request<GameState>(
    `/api/v1/games/${encodeURIComponent(gameId)}/guesses`,
    { method: "POST", body: JSON.stringify({ guess }) },
  );
}

export async function giveUp(gameId: string): Promise<GameState> {
  return request<GameState>(
    `/api/v1/games/${encodeURIComponent(gameId)}/give-up`,
    { method: "POST" },
  );
}

export async function nextRound(gameId: string): Promise<GameState> {
  return request<GameState>(
    `/api/v1/games/${encodeURIComponent(gameId)}/next-round`,
    { method: "POST" },
  );
}
