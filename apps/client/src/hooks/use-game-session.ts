import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import {
  createGame,
  getGame,
  giveUp as giveUpRequest,
  nextRound as nextRoundRequest,
  submitGuess as submitGuessRequest,
} from "@/api/client";
import type { CreateGamePayload, GameState } from "@/api/types";
import { restoreOrCreateGame } from "@/hooks/session-recovery";
import {
  clearSession,
  getRandomBest,
  getSavedSession,
  saveSession,
  updateRandomBest,
  recordRandomPuzzle,
} from "@/storage/game-storage";

export function useGameSession() {
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bestScore, setBestScore] = useState(0);
  const [newRecord, setNewRecord] = useState(false);
  const [feedbackId, setFeedbackId] = useState(0);
  const storageKey = useRef<string | null>(null);
  const operationId = useRef(0);

  useEffect(() => {
    getRandomBest()
      .then(setBestScore)
      .catch(() => undefined);
  }, []);

  const persist = useCallback(async (next: GameState) => {
    if (storageKey.current) await saveSession(storageKey.current, next);
    if (next.mode === "random") {
      if (next.content_id) await recordRandomPuzzle(next.category.slug, next.content_id);
    }
    if (next.mode === "random" && next.status === "complete") {
      const previousBest = await getRandomBest(
        next.category.slug,
        next.total_rounds,
        next.content_version ?? "legacy",
      );
      setBestScore(
        await updateRandomBest(next.score, next.category.slug, next.total_rounds, next.content_version ?? "legacy"),
      );
      setNewRecord(next.score > previousBest);
    }
  }, []);

  const start = useCallback(
    async (payload: CreateGamePayload, key: string, forceNew = false) => {
      const currentOperation = ++operationId.current;
      storageKey.current = key;
      setLoading(true);
      setError(null);
      setNewRecord(false);
      setGame(null);
      try {
        const next = await restoreOrCreateGame(payload, key, forceNew, {
          getSavedSession,
          getGame,
          clearSession,
          createGame,
          saveSession,
        });
        if (currentOperation === operationId.current) setGame(next);
      } catch (caught) {
        if (currentOperation === operationId.current) {
          setError(
            caught instanceof Error
              ? caught.message
              : "No se pudo iniciar la partida.",
          );
        }
      } finally {
        if (currentOperation === operationId.current) setLoading(false);
      }
    },
    [],
  );

  const runAction = useCallback(
    async (action: (gameId: string) => Promise<GameState>): Promise<boolean> => {
      if (!game || acting) return false;
      const currentOperation = operationId.current;
      setActing(true);
      setError(null);
      try {
        const next = await action(game.id);
        if (currentOperation !== operationId.current) return false;
        setGame(next);
        setFeedbackId((value) => value + 1);
        await persist(next);
        return true;
      } catch (caught) {
        if (currentOperation !== operationId.current) return false;
        setError(
          caught instanceof Error
            ? caught.message
            : "No se pudo completar la acción.",
        );
        return false;
      } finally {
        setActing(false);
      }
    },
    [acting, game, persist],
  );

  const submitGuess = useCallback(
    async (guess: string) => {
      if (!game || acting) return false;
      return runAction(async (gameId) => {
        const next = await submitGuessRequest(gameId, guess);
        if (Platform.OS !== "web") {
          if (next.last_result?.outcome === "correct") {
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            );
          } else if (next.last_result?.outcome === "incorrect") {
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Error,
            );
          }
        }
        return next;
      });
    },
    [acting, game, runAction],
  );

  return {
    game,
    loading,
    acting,
    error,
    bestScore,
    newRecord,
    feedbackId,
    start,
    submitGuess,
    giveUp: () => runAction(giveUpRequest),
    nextRound: () => runAction(nextRoundRequest),
    clearError: () => setError(null),
    resetView: () => {
      operationId.current += 1;
      setGame(null);
      setError(null);
      setLoading(false);
    },
  };
}
