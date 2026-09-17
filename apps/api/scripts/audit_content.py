"""Compare the frozen content pack with live Google autocomplete suggestions.

This is an editorial audit tool, not part of production gameplay. It makes one
read-only request per board using the exact prompt and writes a JSON report with
the current answers, Google's current suggestions, and exact overlap metrics.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from google_autocompleta.providers.suggestions import normalize_text

ROOT = Path(__file__).resolve().parents[1]
EDITORIAL = ROOT.parents[1] / ".agents" / "editorial"
CONTENT = ROOT / "content" / "boards-v3.json"
DEFAULT_URL = "https://suggestqueries.google.com/complete/search"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=EDITORIAL / "audit-v3-latest.json",
        help="Where to write the audit report.",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=6,
        help="Maximum number of concurrent Google requests.",
    )
    parser.add_argument(
        "--url",
        default=os.environ.get("GOOGLE_SUGGEST_URL", DEFAULT_URL),
        help="Google autocomplete endpoint.",
    )
    return parser.parse_args()


def extract_suggestions(payload: Any, prompt: str) -> list[str]:
    if not isinstance(payload, list) or len(payload) < 2 or not isinstance(payload[1], list):
        return []
    normalized_prompt = normalize_text(prompt)
    suggestions: list[str] = []
    seen: set[str] = set()
    for candidate in payload[1]:
        if not isinstance(candidate, str):
            continue
        candidate = " ".join(candidate.strip().split())
        normalized = normalize_text(candidate)
        if (
            not candidate
            or normalized == normalized_prompt
            or not normalized.startswith(f"{normalized_prompt} ")
            or normalized in seen
        ):
            continue
        seen.add(normalized)
        suggestions.append(candidate)
        if len(suggestions) == 10:
            break
    return suggestions


def completion_key(prompt: str, value: str) -> str:
    return normalize_text(f"{prompt} {value}")


async def fetch_one(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    url: str,
    board: dict[str, Any],
) -> dict[str, Any]:
    prompt = str(board["prompt"])
    current_answers = [f"{prompt} {item}".strip() for item in board["completions"]]
    result: dict[str, Any] = {
        "id": board["id"],
        "category": board["category"],
        "prompt": prompt,
        "current_answers": current_answers,
        "google_suggestions": [],
        "current_answer_matches": [],
        "google_only": [],
        "current_only": current_answers,
        "error": None,
    }
    async with semaphore:
        try:
            response = await client.get(
                url,
                params={"client": "firefox", "hl": "es", "gl": "es", "q": prompt},
                headers={
                    "Accept-Language": "es-ES,es;q=0.9",
                    "User-Agent": "GoogleAutocompleta/1.0 audit",
                },
            )
            response.raise_for_status()
            try:
                response_text = response.content.decode("utf-8")
            except UnicodeDecodeError:
                response_text = response.content.decode("latin-1")
            payload = json.loads(response_text)
            suggestions = extract_suggestions(payload, prompt)
            result["google_suggestions"] = suggestions
            current_by_key = {completion_key(prompt, answer): answer for answer in current_answers}
            google_by_key = {completion_key(prompt, answer): answer for answer in suggestions}
            matching_keys = set(current_by_key) & set(google_by_key)
            result["current_answer_matches"] = [
                answer for key, answer in current_by_key.items() if key in matching_keys
            ]
            result["google_only"] = [
                answer for key, answer in google_by_key.items() if key not in matching_keys
            ]
            result["current_only"] = [
                answer for key, answer in current_by_key.items() if key not in matching_keys
            ]
        except (httpx.HTTPError, ValueError) as exc:
            result["error"] = str(exc)
    return result


async def run_audit(url: str, workers: int, boards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    timeout = httpx.Timeout(15.0, connect=10.0)
    semaphore = asyncio.Semaphore(max(1, workers))
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        tasks = [fetch_one(client, semaphore, url, board) for board in boards]
        results: list[dict[str, Any]] = []
        for task in asyncio.as_completed(tasks):
            results.append(await task)
            if len(results) % 25 == 0:
                print(f"Audited {len(results)}/{len(boards)} boards")
    return sorted(results, key=lambda item: str(item["id"]))


def build_report(
    manifest: dict[str, Any], boards: list[dict[str, Any]], results: list[dict[str, Any]]
) -> dict[str, Any]:
    successful = [item for item in results if not item["error"]]
    matched = sum(bool(item["current_answer_matches"]) for item in successful)
    total_matches = sum(len(item["current_answer_matches"]) for item in successful)
    return {
        "audit_version": "1",
        "audited_at": datetime.now(UTC).isoformat(),
        "endpoint": DEFAULT_URL,
        "locale": {"language": "es", "country": "ES"},
        "content_version": manifest["content_version"],
        "board_count": len(boards),
        "successful_requests": len(successful),
        "failed_requests": len(results) - len(successful),
        "boards_with_any_exact_match": matched,
        "exact_answer_matches": total_matches,
        "results": results,
    }


def main() -> None:
    args = parse_args()
    if args.workers < 1:
        raise SystemExit("--workers must be at least 1")
    payload = json.loads(CONTENT.read_text(encoding="utf-8"))
    manifest = json.loads((ROOT / "content" / "manifest.json").read_text(encoding="utf-8"))
    boards = list(payload["boards"])
    started = time.monotonic()
    results = asyncio.run(run_audit(args.url, args.workers, boards))
    report = build_report(manifest, boards, results)
    report["endpoint"] = args.url
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Audited {len(results)} boards in {time.monotonic() - started:.1f}s; "
        f"{report['exact_answer_matches']} exact answer matches."
    )
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
