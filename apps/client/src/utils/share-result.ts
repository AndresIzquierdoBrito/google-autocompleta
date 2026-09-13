import type { GameState } from "@/api/types";

export function buildShareText(game: GameState): string {
  const summaries = game.round_summaries ?? [];
  const found = game.mode === "random" && summaries.length
    ? summaries.reduce((sum, item) => sum + item.found, 0)
    : game.slots.filter((slot) => slot.status === "found").length;
  const blocks = game.mode === "random"
    ? summaries.map((item) => `${"🟩".repeat(item.found)}${"⬛".repeat(10 - item.found)}`).join("\n")
    : game.slots.map((slot) => (slot.status === "found" ? "🟩" : "⬛")).join("");
  const number = game.puzzle_number ? ` #${game.puzzle_number}` : "";
  const total = game.mode === "random" ? game.total_rounds * 10 : 10;
  const appUrl =
    process.env.EXPO_PUBLIC_APP_URL ??
    (typeof window !== "undefined" ? window.location.origin : "https://google-autocompleta.app");
  return [
    `Google Autocompleta${number}`,
    `${found}/${total} · ${formatPoints(game.score)} puntos · ${game.misses}/4 fallos`,
    blocks,
    appUrl,
  ].join("\n");
}

export function formatPoints(value: number): string {
  return new Intl.NumberFormat("es-ES").format(value);
}
