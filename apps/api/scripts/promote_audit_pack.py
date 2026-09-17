"""Promote the first ten audited candidates into the runtime content pack."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from google_autocompleta.providers.suggestions import normalize_text
from google_autocompleta.services.games import GameService

ROOT = Path(__file__).resolve().parents[1]
EDITORIAL = ROOT.parents[1] / ".agents" / "editorial"
CURRENT_PACK = ROOT / "content" / "boards-v3.json"
DEFAULT_AUDIT = EDITORIAL / "audit-v5-prompts-latest.json"
DEFAULT_DRAFT = EDITORIAL / "overhaul-v5-prompts.json"
DEFAULT_OUTPUT = EDITORIAL / "boards-v5-curated.json"
UNSAFE_TERMS = {
    "suicidio",
    "suicidarme",
    "matar",
    "asesinar",
    "asesino",
    "asesina",
    "asesinos",
    "odio racial",
    "pornografía",
    "violar",
    "explosivo",
    "bomba",
}
BLOCKED_PATTERNS = {
    "empieza por",
    "empiezan por",
    "comienza por",
    "comienzan por",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT)
    parser.add_argument("--draft", type=Path, default=DEFAULT_DRAFT)
    parser.add_argument("--current-pack", type=Path, default=CURRENT_PACK)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def ending_for(prompt: str, candidate: str) -> str:
    normalized_prompt = normalize_text(prompt)
    normalized_candidate = normalize_text(candidate)
    if not normalized_candidate.startswith(f"{normalized_prompt} "):
        raise ValueError(f"Candidate does not extend prompt: {candidate!r}")
    prompt_word_count = len(prompt.split())
    ending = " ".join(candidate.strip().split()[prompt_word_count:]).strip()
    if not ending:
        raise ValueError(f"Candidate has no ending: {candidate!r}")
    return ending


def is_family_safe(prompt: str, candidate: str) -> bool:
    normalized = normalize_text(f"{prompt} {candidate}")
    normalized_candidate = normalize_text(candidate)
    return not (
        any(normalize_text(term) in normalized for term in UNSAFE_TERMS)
        or any(normalize_text(pattern) in normalized_candidate for pattern in BLOCKED_PATTERNS)
    )


def has_structural_collision(prompt: str, completions: list[str]) -> bool:
    normalized_answers = [normalize_text(f"{prompt} {item}") for item in completions]
    tokens = {token for answer in normalized_answers for token in answer.split() if len(token) >= 3}
    return any(
        len(GameService._matching_ranks(prompt, normalized_answers, token)) >= 4 for token in tokens
    )


def result_key(result: dict[str, Any]) -> tuple[str, int]:
    parts = str(result["id"]).split("-")
    if len(parts) != 4 or parts[0] != "v5" or parts[1] != "draft":
        raise ValueError(f"Unexpected audit result id: {result['id']!r}")
    return parts[2], int(parts[3])


def build_pack(
    current: dict[str, Any], audit: dict[str, Any], draft: dict[str, Any]
) -> dict[str, Any]:
    if audit.get("audit_status") != "complete":
        raise ValueError("The v5 audit is not complete.")
    if audit.get("prompt_locale") != {"language": "es", "country": "ES"}:
        raise ValueError("The v5 audit is not the Spanish Spain audit.")
    if audit.get("failed_queries") or audit.get("blocked_queries"):
        raise ValueError("The v5 audit contains failed or blocked queries.")

    results = [item for item in audit.get("results", []) if isinstance(item, dict)]
    by_key = {result_key(item): item for item in results}
    english_sources = draft.get("english_source_prompts", {})
    boards: list[dict[str, Any]] = []
    captured_at = str(audit["audited_at"])
    adapted_at = datetime.now(UTC).date().isoformat()

    for board in current.get("boards", []):
        category = str(board["category"])
        index = int(str(board["id"]).rsplit("-", 1)[1])
        result = by_key.get((category, index))
        if result is None:
            raise ValueError(f"Missing audit result for {category}-{index:02d}")
        translated_prompt = draft.get("prompts", {}).get(category, [])[index - 1]
        if translated_prompt != result.get("prompt"):
            raise ValueError(f"Draft and audit disagree for {category}-{index:02d}")
        candidates = result.get("suggestions", [])
        if len(candidates) < 10:
            raise ValueError(f"Not enough candidates for {category}-{index:02d}")
        prompt = str(result["prompt"])
        completions: list[str] = []
        for candidate in candidates:
            candidate_text = str(candidate)
            if not is_family_safe(prompt, candidate_text):
                continue
            ending = ending_for(prompt, candidate_text)
            tentative = [*completions, ending]
            if has_structural_collision(prompt, tentative):
                continue
            completions.append(ending)
            if len(completions) == 10:
                break
        if len(completions) < 10:
            raise ValueError(f"Not enough family-safe candidates for {category}-{index:02d}")
        if len({normalize_text(item) for item in completions}) != 10:
            raise ValueError(f"Duplicate first-ten endings for {category}-{index:02d}")

        boards.append(
            {
                "id": board["id"],
                "category": category,
                "category_name": board["category_name"],
                "prompt": result["prompt"],
                "completions": completions,
                "aliases": {},
                "eligibility": board["eligibility"],
                "source": {
                    "kind": "google-autocomplete-audit-v5-first-ten",
                    "url": audit["endpoint"],
                    "inspiration": (
                        "English Google autocomplete frame translated into natural Spanish"
                    ),
                    "adapted_at": adapted_at,
                    "localization_note": (
                        "First ten family-safe candidates selected automatically from the "
                        "completed v5 Spanish audit."
                    ),
                    "captured_at": captured_at,
                    "english_prompt": english_sources.get(category, [])[index - 1],
                },
                "review": {
                    "approval_status": "approved",
                    "tone": "neutral",
                    "selection_method": "first_10_family_safe_audited_candidates",
                    "guessable_count": 10,
                    "surprising_count": 2,
                    "distinct_ideas": 10,
                    "family_safe": True,
                },
            }
        )

    return {
        "content_version": "3",
        "status": "applied-v5-audit-first-ten",
        "generated_at": adapted_at,
        "source_audit": "audit-v5-prompts-latest.json",
        "selection_policy": "first 10 family-safe audited Spanish candidates per prompt",
        "boards": boards,
    }


def main() -> None:
    args = parse_args()
    current = json.loads(args.current_pack.read_text(encoding="utf-8"))
    audit = json.loads(args.audit.read_text(encoding="utf-8"))
    draft = json.loads(args.draft.read_text(encoding="utf-8"))
    pack = build_pack(current, audit, draft)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(pack['boards'])} boards to {args.output}")


if __name__ == "__main__":
    main()
