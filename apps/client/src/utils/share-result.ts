import type { GameState } from "@/api/types";

export function buildShareText(game: GameState): string {
  const found = game.slots.filter((slot) => slot.status === "found").length;
  const blocks = game.slots
    .map((slot) => (slot.status === "found" ? "🟩" : "⬛"))
    .join("");
  const number = game.puzzle_number ? ` #${game.puzzle_number}` : "";
  return [
    `Google Autocompleta${number}`,
    `${found}/10 · ${formatPoints(game.score)} puntos · ${game.misses}/4 fallos`,
    blocks,
    "google-autocompleta",
  ].join("\n");
}

export function formatPoints(value: number): string {
  return new Intl.NumberFormat("es-ES").format(value);
}
