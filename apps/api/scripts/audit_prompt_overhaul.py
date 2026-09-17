"""Check a proposed prompt list against live Google autocomplete.

This is an editorial tool for the v5 English-source translation draft. It can
run an exact source-language check or expand every translated prompt into an
exact query plus natural suffix queries, collecting up to thirty candidate
completions before the editor selects ten final endings. Requests are globally
rate-limited and the audit stops before the full run if Google still returns an
automated-query block.
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
DEFAULT_PROMPTS_PATH = EDITORIAL / "overhaul-v5-prompts.json"
DEFAULT_URL = "https://suggestqueries.google.com/complete/search"
DEFAULT_DELAY_SECONDS = 0.3
DEFAULT_INITIAL_DELAY_SECONDS = 30.0
DEFAULT_RETRIES = 2
DEFAULT_RETRY_BACKOFF_SECONDS = 30.0
QUERY_SUFFIXES = [
    "a",
    "de",
    "del",
    "la",
    "lo",
    "un",
    "una",
    "que",
    "como",
    "por",
    "para",
    "en",
    "con",
    "sin",
    "es",
    "se",
    "mi",
    "me",
    "te",
    "hay",
    "puede",
    "puedo",
    "cuando",
    "donde",
    "por qué",
    "si",
    "qué",
    "cuánto",
    "mejor",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=EDITORIAL / "audit-v5-prompts-latest.json",
        help="Where to write the prompt audit report.",
    )
    parser.add_argument(
        "--prompts-path",
        type=Path,
        default=DEFAULT_PROMPTS_PATH,
        help="Prompt draft JSON to audit.",
    )
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument(
        "--delay-seconds",
        type=float,
        default=DEFAULT_DELAY_SECONDS,
        help="Minimum global delay between starting Google requests.",
    )
    parser.add_argument(
        "--initial-delay-seconds",
        type=float,
        default=DEFAULT_INITIAL_DELAY_SECONDS,
        help="Cooldown before the preflight request.",
    )
    parser.add_argument("--retries", type=int, default=DEFAULT_RETRIES)
    parser.add_argument(
        "--retry-backoff-seconds",
        type=float,
        default=DEFAULT_RETRY_BACKOFF_SECONDS,
    )
    parser.add_argument(
        "--category",
        choices=(
            "cultura",
            "personas",
            "nombres",
            "preguntas",
            "animales",
            "entretenimiento",
            "comida",
        ),
        help="Only audit one category while iterating on the draft.",
    )
    parser.add_argument(
        "--prompt",
        action="append",
        dest="only_prompts",
        help="Audit only the supplied prompt(s) while iterating on replacements.",
    )
    parser.add_argument(
        "--prompt-field",
        choices=("prompts", "english_source_prompts"),
        default="prompts",
        help="Prompt field to audit; use english_source_prompts for source verification.",
    )
    parser.add_argument("--language", default=None, help="Google language code.")
    parser.add_argument("--country", default=None, help="Google country code.")
    parser.add_argument(
        "--exact-only",
        action="store_true",
        help="Run only the exact prompt query instead of the 30-query candidate pass.",
    )
    parser.add_argument(
        "--url",
        default=os.environ.get("GOOGLE_SUGGEST_URL", DEFAULT_URL),
        help="Google autocomplete endpoint.",
    )
    return parser.parse_args()


class RequestGate:
    """Serialize request starts so workers cannot burst the endpoint."""

    def __init__(self, delay_seconds: float) -> None:
        self.delay_seconds = delay_seconds
        self._lock = asyncio.Lock()
        self._next_request_at = 0.0

    async def wait(self) -> None:
        async with self._lock:
            now = time.monotonic()
            wait_seconds = max(0.0, self._next_request_at - now)
            self._next_request_at = max(now, self._next_request_at) + self.delay_seconds
        if wait_seconds:
            await asyncio.sleep(wait_seconds)


def extract_suggestions(payload: Any, prompt: str) -> list[str]:
    if not isinstance(payload, list) or len(payload) < 2 or not isinstance(payload[1], list):
        return []
    normalized_prompt = normalize_text(prompt)
    suggestions: list[str] = []
    seen: set[str] = set()
    for value in payload[1]:
        if not isinstance(value, str):
            continue
        candidate = " ".join(value.strip().split())
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


async def fetch_one(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    url: str,
    category: str,
    index: int,
    prompt: str,
    gate: RequestGate,
    retries: int,
    retry_backoff_seconds: float,
    language: str,
    country: str,
    query_suffixes: list[str],
    id_prefix: str,
    stop_event: asyncio.Event,
) -> dict[str, Any]:
    queries = [prompt, *[f"{prompt} {suffix}" for suffix in query_suffixes]]
    result: dict[str, Any] = {
        "id": f"{id_prefix}-draft-{category}-{index + 1:02d}",
        "category": category,
        "eligibility": "daily" if index < 5 else "random",
        "prompt": prompt,
        "suggestions": [],
        "queries_run": len(queries),
        "failed_queries": 0,
        "blocked_queries": 0,
        "error": None,
    }

    async def fetch_query(query: str) -> tuple[str, list[str], str | None, bool]:
        for attempt in range(retries + 1):
            if stop_event.is_set():
                return query, [], "Audit stopped after Google returned a block.", True
            async with semaphore:
                if stop_event.is_set():
                    return query, [], "Audit stopped after Google returned a block.", True
                await gate.wait()
                if stop_event.is_set():
                    return query, [], "Audit stopped after Google returned a block.", True
                try:
                    response = await client.get(
                        url,
                        params={
                            "client": "firefox",
                            "hl": language,
                            "gl": country,
                            "q": query,
                        },
                        headers={
                            "Accept-Language": (
                                "en-US,en;q=0.9" if language == "en" else "es-ES,es;q=0.9"
                            ),
                            "User-Agent": "GoogleAutocompleta/1.0 prompt audit",
                        },
                    )
                    response.raise_for_status()
                    try:
                        response_text = response.content.decode("utf-8")
                    except UnicodeDecodeError:
                        response_text = response.content.decode("latin-1")
                    return (
                        query,
                        extract_suggestions(json.loads(response_text), prompt),
                        None,
                        False,
                    )
                except httpx.HTTPStatusError as exc:
                    blocked = exc.response.status_code in {403, 429}
                    if blocked:
                        stop_event.set()
                        return query, [], str(exc), True
                    if attempt < retries:
                        await asyncio.sleep(retry_backoff_seconds * (2**attempt))
                        continue
                    return query, [], str(exc), blocked
                except (httpx.HTTPError, ValueError) as exc:
                    return query, [], str(exc), False

    fetched = await asyncio.gather(*(fetch_query(query) for query in queries))
    seen: set[str] = set()
    for _query, suggestions, error, blocked in fetched:
        if error is not None:
            result["failed_queries"] += 1
            result["blocked_queries"] += blocked
            continue
        for suggestion in suggestions:
            key = normalize_text(suggestion)
            if key in seen:
                continue
            seen.add(key)
            result["suggestions"].append(suggestion)
            if len(result["suggestions"]) == 30:
                break
        if len(result["suggestions"]) == 30:
            break
    if result["blocked_queries"]:
        result["error"] = "Google returned HTTP 403/429; audit stopped."
    elif result["failed_queries"]:
        result["error"] = "One or more Google queries failed."
    return result


async def run(
    url: str,
    workers: int,
    prompts: dict[str, list[str]],
    delay_seconds: float,
    initial_delay_seconds: float,
    retries: int,
    retry_backoff_seconds: float,
    language: str,
    country: str,
    query_suffixes: list[str],
    id_prefix: str,
) -> list[dict[str, Any]]:
    semaphore = asyncio.Semaphore(max(1, workers))
    gate = RequestGate(delay_seconds)
    stop_event = asyncio.Event()
    timeout = httpx.Timeout(15.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        if initial_delay_seconds:
            print(f"Waiting {initial_delay_seconds:.0f}s before Google preflight")
            await asyncio.sleep(initial_delay_seconds)
        await gate.wait()
        preflight_prompt = next(
            (item for items in prompts.values() for item in items),
            "España",
        )
        preflight = await client.get(
            url,
            params={
                "client": "firefox",
                "hl": language,
                "gl": country,
                "q": preflight_prompt,
            },
            headers={
                "Accept-Language": ("en-US,en;q=0.9" if language == "en" else "es-ES,es;q=0.9"),
                "User-Agent": "GoogleAutocompleta/1.0 prompt audit",
            },
        )
        if preflight.status_code in {403, 429}:
            raise RuntimeError(
                f"Google preflight blocked the audit with HTTP {preflight.status_code}; "
                "wait for the cooldown before retrying."
            )
        preflight.raise_for_status()
        tasks = [
            fetch_one(
                client,
                semaphore,
                url,
                category,
                index,
                prompt,
                gate,
                retries,
                retry_backoff_seconds,
                language,
                country,
                query_suffixes,
                id_prefix,
                stop_event,
            )
            for category, items in prompts.items()
            for index, prompt in enumerate(items)
        ]
        results: list[dict[str, Any]] = []
        audit_started = time.monotonic()
        for task in asyncio.as_completed(tasks):
            results.append(await task)
            if len(results) == 1 or len(results) % 5 == 0:
                completed_queries = sum(item["queries_run"] for item in results)
                successful_queries = sum(
                    item["queries_run"] - item["failed_queries"] for item in results
                )
                elapsed = time.monotonic() - audit_started
                print(
                    f"Audited {len(results)}/{len(tasks)} prompts; "
                    f"{successful_queries}/{completed_queries} queries succeeded "
                    f"({elapsed / 60:.1f} min elapsed)"
                )
    return sorted(results, key=lambda item: str(item["id"]))


def main() -> None:
    args = parse_args()
    if args.workers < 1:
        raise SystemExit("--workers must be at least 1")
    if args.delay_seconds < 0.2:
        raise SystemExit("--delay-seconds must be at least 0.2 to protect the endpoint")
    if args.initial_delay_seconds < 0 or args.retries < 0 or args.retry_backoff_seconds < 0:
        raise SystemExit("delay and retry values cannot be negative")
    payload = json.loads(args.prompts_path.read_text(encoding="utf-8"))
    prompts = payload[args.prompt_field]
    if args.only_prompts:
        prompts = {args.category or "custom": args.only_prompts}
    elif args.category:
        prompts = {args.category: prompts[args.category]}
    language = args.language or ("en" if args.prompt_field == "english_source_prompts" else "es")
    country = args.country or ("US" if args.prompt_field == "english_source_prompts" else "ES")
    query_suffixes = [] if args.exact_only else QUERY_SUFFIXES
    version_number = str(payload.get("content_version", "5-draft")).split("-", 1)[0]
    id_prefix = version_number if version_number.startswith("v") else f"v{version_number}"
    started = time.monotonic()
    try:
        results = asyncio.run(
            run(
                args.url,
                args.workers,
                prompts,
                args.delay_seconds,
                args.initial_delay_seconds,
                args.retries,
                args.retry_backoff_seconds,
                language,
                country,
                query_suffixes,
                id_prefix,
            )
        )
    except (httpx.HTTPError, RuntimeError) as exc:
        blocked_report = {
            "audit_version": "1",
            "audit_status": "blocked",
            "audited_at": datetime.now(UTC).isoformat(),
            "endpoint": args.url,
            "locale": {"language": language, "country": country},
            "prompt_source": args.prompts_path.name,
            "prompt_field": args.prompt_field,
            "prompt_locale": {"language": language, "country": country},
            "prompt_count": sum(len(items) for items in prompts.values()),
            "error": str(exc),
            "results": [],
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(blocked_report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        raise SystemExit(str(exc)) from exc
    blocked_queries = sum(item["blocked_queries"] for item in results)
    successful = [item for item in results if item["error"] is None]
    report = {
        "audit_version": "1",
        "audit_status": "blocked" if blocked_queries else "complete",
        "audited_at": datetime.now(UTC).isoformat(),
        "endpoint": args.url,
        "locale": {"language": language, "country": country},
        "prompt_source": args.prompts_path.name,
        "prompt_field": args.prompt_field,
        "prompt_locale": {"language": language, "country": country},
        "prompt_count": len(results),
        "successful_prompt_batches": len(successful),
        "failed_prompt_batches": len(results) - len(successful),
        "total_queries": sum(item["queries_run"] for item in results),
        "successful_queries": sum(item["queries_run"] - item["failed_queries"] for item in results),
        "failed_queries": sum(item["failed_queries"] for item in results),
        "blocked_queries": sum(item["blocked_queries"] for item in results),
        "prompts_with_10_or_more": sum(len(item["suggestions"]) >= 10 for item in successful),
        "prompts_with_30_candidates": sum(len(item["suggestions"]) >= 30 for item in successful),
        "prompts_with_any_suggestions": sum(bool(item["suggestions"]) for item in successful),
        "results": results,
    }
    if blocked_queries:
        report["error"] = (
            "Google returned HTTP 403/429; audit stopped before sending more requests."
        )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Audited {len(results)} prompts in {time.monotonic() - started:.1f}s; "
        f"{report['successful_queries']}/{report['total_queries']} queries succeeded; "
        f"{report['prompts_with_10_or_more']} prompts have ten or more suggestions."
    )
    print(f"Wrote {args.output}")
    if blocked_queries:
        raise SystemExit(report["error"])


if __name__ == "__main__":
    main()
