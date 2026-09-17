import asyncio
import json
from pathlib import Path
from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from google_autocompleta.api.dependencies import get_game_service
from google_autocompleta.data import CATEGORY_NAMES
from google_autocompleta.providers import SuggestionError
from google_autocompleta.providers.suggestions import normalize_text
from google_autocompleta.services import GameService

router = APIRouter(prefix="/audit", tags=["audit"])

API_PATH = Path(__file__).resolve().parents[3]
CONTENT_PATH = API_PATH / "content" / "boards-v3.json"
# In the repository, ``API_PATH`` is ``.../apps/api`` and the editorial files
# live under the repository root. In the API image, ``API_PATH`` is ``/app``;
# walking parents by index would raise during module import because ``/`` has
# no second parent. The parent traversal is valid in both layouts, and the
# files remain optional when the production audit console is disabled.
EDITORIAL_PATH = API_PATH.parent.parent / ".agents" / "editorial"
PROMPT_DRAFT_PATH = EDITORIAL_PATH / "overhaul-v5-prompts.json"
PROMPT_AUDIT_PATH = EDITORIAL_PATH / "audit-v5-prompts-latest.json"
AUDIT_PATH = EDITORIAL_PATH / "audit-v3-latest.json"

# These are real query suffixes. Together with the exact prompt they produce a
# 30-query candidate pass while keeping the audit focused on natural Spanish
# completions rather than arbitrary generated text.
DEFAULT_QUERY_SUFFIXES = [
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


class AuditSuggestionRequest(BaseModel):
    query_suffixes: list[str] = Field(
        default_factory=lambda: list(DEFAULT_QUERY_SUFFIXES), max_length=29
    )
    max_candidates: int = Field(default=30, ge=10, le=60)


class FreeAuditSuggestionRequest(AuditSuggestionRequest):
    prompt: str = Field(min_length=1, max_length=160)


class PromptVariantsRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=160)
    max_variants: int = Field(default=6, ge=2, le=8)


class AuditCandidate(BaseModel):
    text: str
    ending: str
    source_query: str
    source_rank: int
    exact_prompt_query: bool


class AuditSuggestionResponse(BaseModel):
    prompt: str
    queries_run: int
    failed_queries: int
    candidates: list[AuditCandidate]


class PromptVariant(BaseModel):
    prompt: str
    token_count: int
    suggestions: list[str]
    error: str | None = None


class PromptVariantsResponse(BaseModel):
    original_prompt: str
    variants: list[PromptVariant]


class AuditSnapshot(BaseModel):
    google_suggestions: list[str] = Field(default_factory=list)
    current_answer_matches: list[str] = Field(default_factory=list)
    error: str | None = None


class AuditBoard(BaseModel):
    id: str
    category: str
    category_name: str
    prompt: str
    english_prompt: str | None = None
    completions: list[str]
    aliases: dict[str, list[int]]
    eligibility: str
    source: dict[str, Any]
    review: dict[str, Any]
    audit: AuditSnapshot | None = None


class AuditPack(BaseModel):
    content_version: str
    status: str
    generated_at: str | None = None
    audited_at: str | None = None
    boards: list[AuditBoard]


def _ensure_audit_enabled(service: GameService) -> None:
    if not service.settings.audit_enabled or service.settings.app_env in {"prod", "production"}:
        raise HTTPException(status_code=404, detail="Audit console is disabled.")


def _read_json(path: Path) -> dict[str, Any]:
    try:
        return cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=503, detail="The content pack is unavailable.") from exc


def _board_pack(service: GameService) -> AuditPack:
    _ensure_audit_enabled(service)
    if PROMPT_DRAFT_PATH.exists():
        payload = _read_json(PROMPT_DRAFT_PATH)
    else:
        payload = _read_json(CONTENT_PATH)
    draft_mode = "prompts" in payload
    audit_path = PROMPT_AUDIT_PATH if draft_mode else AUDIT_PATH
    audit_payload = _read_json(audit_path) if audit_path.exists() else {}
    audit_by_id = {
        item["id"]: AuditSnapshot(
            google_suggestions=item.get("google_suggestions", item.get("suggestions", [])),
            current_answer_matches=item.get("current_answer_matches", []),
            error=item.get("error"),
        )
        for item in audit_payload.get("results", [])
        if isinstance(item, dict) and item.get("id")
    }
    if draft_mode:
        captured_at = audit_payload.get("audited_at") or payload.get("generated_at")
        english_sources = payload.get("english_source_prompts", {})
        boards = []
        for category, prompts in payload.get("prompts", {}).items():
            for index, prompt in enumerate(prompts):
                board_id = f"v5-draft-{category}-{index + 1:02d}"
                source_prompts = english_sources.get(category, [])
                english_prompt = str(source_prompts[index]) if index < len(source_prompts) else None
                boards.append(
                    AuditBoard(
                        id=board_id,
                        category=str(category),
                        category_name=CATEGORY_NAMES.get(str(category), str(category)),
                        prompt=str(prompt),
                        english_prompt=english_prompt,
                        completions=[],
                        aliases={},
                        eligibility="daily" if index < 5 else "random",
                        source={
                            "kind": "google-autocomplete-audit-draft",
                            "url": "https://suggestqueries.google.com/complete/search",
                            "inspiration": "Short Spanish autocomplete-friendly prompt stem",
                            "captured_at": captured_at,
                        },
                        review={
                            "approval_status": "draft",
                            "family_safe": True,
                            "guessable_count": 0,
                            "surprising_count": 0,
                        },
                        audit=audit_by_id.get(board_id),
                    )
                )
    else:
        boards = [
            AuditBoard(
                id=str(board["id"]),
                category=str(board["category"]),
                category_name=CATEGORY_NAMES.get(str(board["category"]), str(board["category"])),
                prompt=str(board["prompt"]),
                english_prompt=None,
                completions=[str(item) for item in board.get("completions", [])],
                aliases=dict(board.get("aliases", {})),
                eligibility=str(board.get("eligibility", "random")),
                source=dict(board.get("source", {})),
                review=dict(board.get("review", {})),
                audit=audit_by_id.get(str(board["id"])),
            )
            for board in payload.get("boards", [])
        ]
    return AuditPack(
        content_version=str(payload.get("content_version", "5-draft" if draft_mode else "")),
        status=str(
            payload.get(
                "status",
                "prompt-overhaul-draft" if draft_mode else "reviewed-localized-pack",
            )
        ),
        generated_at=payload.get("generated_at"),
        audited_at=audit_payload.get("audited_at"),
        boards=boards,
    )


def _ending_for(prompt: str, candidate: str) -> str | None:
    normalized_prompt = normalize_text(prompt)
    normalized_candidate = normalize_text(candidate)
    if not normalized_candidate.startswith(f"{normalized_prompt} "):
        return None
    if candidate.casefold().startswith(prompt.casefold()):
        ending = candidate[len(prompt) :].strip()
    else:
        ending = candidate
    return ending or None


async def _suggestions_for_prompt(
    prompt: str,
    service: GameService,
    suffixes: list[str],
    max_candidates: int,
) -> AuditSuggestionResponse:
    queries = [prompt, *[f"{prompt} {suffix}" for suffix in suffixes]]
    semaphore = asyncio.Semaphore(5)

    async def fetch_query(query: str) -> tuple[str, list[str]]:
        async with semaphore:
            try:
                return query, await service.provider.fetch(query)
            except SuggestionError:
                return query, []

    fetched = await asyncio.gather(*(fetch_query(query) for query in queries))
    candidates: list[AuditCandidate] = []
    seen: set[str] = set()
    for query, suggestions in fetched:
        for rank, suggestion in enumerate(suggestions, start=1):
            ending = _ending_for(prompt, suggestion)
            if ending is None:
                continue
            key = normalize_text(ending)
            if key in seen:
                continue
            seen.add(key)
            candidates.append(
                AuditCandidate(
                    text=suggestion,
                    ending=ending,
                    source_query=query,
                    source_rank=rank,
                    exact_prompt_query=query == prompt,
                )
            )
            if len(candidates) >= max_candidates:
                break
        if len(candidates) >= max_candidates:
            break

    return AuditSuggestionResponse(
        prompt=prompt,
        queries_run=len(queries),
        failed_queries=sum(not suggestions for _, suggestions in fetched),
        candidates=candidates,
    )


def _prompt_prefixes(prompt: str, max_variants: int) -> list[str]:
    words = prompt.split()
    if len(words) < 2:
        return [prompt]
    stop = max(0, len(words) - max_variants)
    return [" ".join(words[:count]) for count in range(len(words), stop, -1)]


@router.post("/prompt-variants", response_model=PromptVariantsResponse)
async def audit_prompt_variants(
    payload: PromptVariantsRequest,
    service: Annotated[GameService, Depends(get_game_service)],
) -> PromptVariantsResponse:
    _ensure_audit_enabled(service)
    prompts = _prompt_prefixes(payload.prompt, payload.max_variants)
    semaphore = asyncio.Semaphore(5)

    async def fetch_variant(prompt: str) -> PromptVariant:
        async with semaphore:
            try:
                suggestions = await service.provider.fetch(prompt)
                return PromptVariant(
                    prompt=prompt,
                    token_count=len(prompt.split()),
                    suggestions=suggestions,
                )
            except SuggestionError as exc:
                return PromptVariant(
                    prompt=prompt,
                    token_count=len(prompt.split()),
                    suggestions=[],
                    error=str(exc),
                )

    variants = await asyncio.gather(*(fetch_variant(prompt) for prompt in prompts))
    return PromptVariantsResponse(original_prompt=payload.prompt, variants=list(variants))


@router.get("/boards", response_model=AuditPack)
async def list_audit_boards(
    service: Annotated[GameService, Depends(get_game_service)],
) -> AuditPack:
    return _board_pack(service)


@router.post("/suggestions", response_model=AuditSuggestionResponse)
async def audit_suggestions(
    payload: FreeAuditSuggestionRequest,
    service: Annotated[GameService, Depends(get_game_service)],
) -> AuditSuggestionResponse:
    _ensure_audit_enabled(service)
    suffixes = list(dict.fromkeys(item.strip() for item in payload.query_suffixes if item.strip()))[
        :29
    ]
    return await _suggestions_for_prompt(
        payload.prompt,
        service,
        suffixes,
        payload.max_candidates,
    )


@router.post("/boards/{board_id}/suggestions", response_model=AuditSuggestionResponse)
async def audit_board_suggestions(
    board_id: str,
    payload: AuditSuggestionRequest,
    service: Annotated[GameService, Depends(get_game_service)],
) -> AuditSuggestionResponse:
    pack = _board_pack(service)
    board = next((item for item in pack.boards if item.id == board_id), None)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found.")

    suffixes = list(dict.fromkeys(item.strip() for item in payload.query_suffixes if item.strip()))[
        :29
    ]
    return await _suggestions_for_prompt(
        board.prompt,
        service,
        suffixes,
        payload.max_candidates,
    )
