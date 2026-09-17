import type { components } from "./schema";

export type GameState = components["schemas"]["GameState"];
export type GameMode = components["schemas"]["GameMode"];
export type GameStatus = components["schemas"]["GameStatus"];
export type AnswerSlot = components["schemas"]["AnswerSlot"];
export type Category = components["schemas"]["CategoryOut"];
export type ArchivePuzzle = components["schemas"]["ArchivePuzzleOut"];
export type CreateGamePayload = components["schemas"]["CreateGameRequest"];
export type GuessResult = components["schemas"]["GuessResult"];
export type GuessOutcome = components["schemas"]["GuessOutcome"];
export type RoundSummary = components["schemas"]["RoundSummary"];

export type AuditSnapshot = {
  google_suggestions: string[];
  current_answer_matches: string[];
  error: string | null;
};

export type AuditBoard = {
  id: string;
  category: string;
  category_name: string;
  prompt: string;
  english_prompt: string | null;
  completions: string[];
  aliases: Record<string, number[]>;
  eligibility: string;
  source: Record<string, unknown>;
  review: Record<string, unknown>;
  audit: AuditSnapshot | null;
};

export type AuditPack = {
  content_version: string;
  status: string;
  generated_at: string | null;
  audited_at: string | null;
  boards: AuditBoard[];
};

export type AuditCandidate = {
  text: string;
  ending: string;
  source_query: string;
  source_rank: number;
  exact_prompt_query: boolean;
};

export type AuditSuggestionResponse = {
  prompt: string;
  queries_run: number;
  failed_queries: number;
  candidates: AuditCandidate[];
};

export type PromptVariant = {
  prompt: string;
  token_count: number;
  suggestions: string[];
  error: string | null;
};

export type PromptVariantsResponse = {
  original_prompt: string;
  variants: PromptVariant[];
};
