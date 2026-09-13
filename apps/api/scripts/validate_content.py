"""Validate the immutable v3 localized content pack."""

import json
from collections import Counter
from pathlib import Path

from google_autocompleta.data import CATEGORY_NAMES
from google_autocompleta.providers.suggestions import normalize_text
from google_autocompleta.services.games import GameService

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / "content" / "manifest.json").read_text(encoding="utf-8"))
PACK = json.loads((ROOT / "content" / "boards-v3.json").read_text(encoding="utf-8"))

UNSAFE_TERMS = {
    "suicidio",
    "suicidarme",
    "matar",
    "asesinar",
    "odio racial",
    "pornografía",
    "violar",
    "explosivo",
    "bomba",
}


def main() -> int:
    errors: list[str] = []
    boards = PACK.get("boards", [])
    if PACK.get("content_version") != MANIFEST["content_version"]:
        errors.append("pack and manifest content versions differ")
    if len(boards) != MANIFEST["target_board_count"]:
        errors.append(f"expected {MANIFEST['target_board_count']} boards, got {len(boards)}")

    ids: set[str] = set()
    category_counts: Counter[str] = Counter()
    eligibility_counts: Counter[tuple[str, str]] = Counter()
    for board in boards:
        board_id = str(board.get("id", ""))
        category = str(board.get("category", ""))
        prompt = str(board.get("prompt", "")).strip()
        completions = board.get("completions", [])
        normalized_answers = [normalize_text(f"{prompt} {item}") for item in completions]
        source = board.get("source", {})
        review = board.get("review", {})

        if not board_id or board_id in ids:
            errors.append(f"duplicate or missing id: {board_id!r}")
        ids.add(board_id)
        if category not in CATEGORY_NAMES:
            errors.append(f"{board_id}: invalid category")
        category_counts[category] += 1
        eligibility = board.get("eligibility")
        eligibility_counts[(category, eligibility)] += 1
        if len(completions) != 10:
            errors.append(f"{board_id}: expected exactly ten completions")
        if len(set(normalized_answers)) != len(normalized_answers):
            errors.append(f"{board_id}: duplicate normalized answer")
        if not prompt or any(normalize_text(prompt) not in answer for answer in normalized_answers):
            errors.append(f"{board_id}: malformed completion frame")
        if category == "nombres" and any(
            "empiezan por" in normalize_text(item) for item in completions
        ):
            errors.append(f"{board_id}: letter-list name board")
        if (
            not source.get("url")
            or not source.get("inspiration")
            or not source.get("adapted_at")
            or not source.get("captured_at")
        ):
            errors.append(f"{board_id}: missing provenance")
        if review.get("approval_status") != "approved" or not review.get("family_safe"):
            errors.append(f"{board_id}: board is not approved and family-safe")
        if review.get("guessable_count", 0) < 6 or review.get("surprising_count", 0) < 2:
            errors.append(f"{board_id}: editorial payoff gates not met")
        unsafe_text = normalize_text(" ".join([prompt, *map(str, completions)]))
        if any(normalize_text(term) in unsafe_text for term in UNSAFE_TERMS):
            errors.append(f"{board_id}: unsafe term")

        for token in sorted({token for answer in normalized_answers for token in answer.split()}):
            if len(token) < 3:
                continue
            fanout = len(GameService._matching_ranks(prompt, normalized_answers, token))
            if fanout >= 4:
                errors.append(f"{board_id}: structural token {token!r} matches {fanout}")

    for category in CATEGORY_NAMES:
        expected_random = MANIFEST["random_target_per_category"]
        expected_daily = MANIFEST["daily_reserve_per_category"]
        if category_counts[category] != expected_random + expected_daily:
            errors.append(f"{category}: expected 30 boards")
        if eligibility_counts[(category, "random")] != expected_random:
            errors.append(f"{category}: expected {expected_random} Random boards")
        if eligibility_counts[(category, "daily")] != expected_daily:
            errors.append(f"{category}: expected {expected_daily} Daily boards")

    if errors:
        print("\n".join(errors))
        return 1
    print(f"Validated {len(boards)} approved v3 boards across {len(CATEGORY_NAMES)} categories.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
