import asyncio
import json
import time
import unicodedata
from dataclasses import dataclass

import httpx


class SuggestionError(RuntimeError):
    pass


def normalize_text(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    without_accents = "".join(char for char in decomposed if not unicodedata.combining(char))
    cleaned = "".join(char if char.isalnum() else " " for char in without_accents)
    return " ".join(cleaned.split())


@dataclass(slots=True)
class _CacheEntry:
    expires_at: float
    answers: list[str]


class GoogleSuggestProvider:
    def __init__(self, url: str, timeout_seconds: float, cache_seconds: int) -> None:
        self._url = url
        self._timeout = timeout_seconds
        self._cache_seconds = cache_seconds
        self._cache: dict[str, _CacheEntry] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    async def fetch(self, prompt: str) -> list[str]:
        key = normalize_text(prompt)
        cached = self._cache.get(key)
        if cached and cached.expires_at > time.monotonic():
            return list(cached.answers)

        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            cached = self._cache.get(key)
            if cached and cached.expires_at > time.monotonic():
                return list(cached.answers)
            answers = await self._fetch_with_retry(prompt)
            self._cache[key] = _CacheEntry(
                expires_at=time.monotonic() + self._cache_seconds,
                answers=answers,
            )
            return list(answers)

    async def _fetch_with_retry(self, prompt: str) -> list[str]:
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                return await self._fetch_once(prompt)
            except (httpx.HTTPError, SuggestionError, json.JSONDecodeError) as exc:
                last_error = exc
                if attempt == 0:
                    await asyncio.sleep(0.15)
        raise SuggestionError("No se pudieron obtener sugerencias válidas.") from last_error

    async def _fetch_once(self, prompt: str) -> list[str]:
        async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
            response = await client.get(
                self._url,
                params={"client": "firefox", "hl": "es", "gl": "es", "q": prompt},
                headers={
                    "Accept-Language": "es-ES,es;q=0.9",
                    "User-Agent": "GoogleAutocompleta/1.0",
                },
            )
            response.raise_for_status()

        try:
            text = response.content.decode("utf-8")
        except UnicodeDecodeError:
            text = response.content.decode("latin-1")
        payload = json.loads(text)
        if not isinstance(payload, list) or len(payload) < 2 or not isinstance(payload[1], list):
            raise SuggestionError("Formato de sugerencias inesperado.")

        normalized_prompt = normalize_text(prompt)
        answers: list[str] = []
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
            answers.append(candidate)
            if len(answers) == 10:
                break
        if len(answers) < 10:
            raise SuggestionError("Google devolvió menos de diez sugerencias utilizables.")
        return answers
