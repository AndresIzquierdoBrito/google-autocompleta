import json

import pytest
import respx
from httpx import Response

from google_autocompleta.providers import GoogleSuggestProvider, SuggestionError
from google_autocompleta.providers.suggestions import normalize_text


def test_normalize_spanish_text() -> None:
    assert normalize_text("  ¿TORTÍLLA... de PATATAS? ") == "tortilla de patatas"


@pytest.mark.asyncio
async def test_provider_parses_latin1_and_filters_prompt() -> None:
    payload = [
        "por qué los gatos",
        ["por qué los gatos"] + [f"por qué los gatos opción {n}" for n in range(11)],
    ]
    content = json.dumps(payload, ensure_ascii=False).encode("latin-1")
    with respx.mock() as router:
        router.get("https://suggest.test/complete").mock(
            return_value=Response(
                200, content=content, headers={"content-type": "application/json"}
            )
        )
        provider = GoogleSuggestProvider("https://suggest.test/complete", 1, 60)
        answers = await provider.fetch("por qué los gatos")
    assert len(answers) == 10
    assert answers[0].endswith("opción 0")


@pytest.mark.asyncio
async def test_provider_rejects_short_response_after_retry() -> None:
    with respx.mock() as router:
        route = router.get("https://suggest.test/complete").mock(
            return_value=Response(200, json=["consulta", ["consulta respuesta"]])
        )
        provider = GoogleSuggestProvider("https://suggest.test/complete", 1, 60)
        with pytest.raises(SuggestionError):
            await provider.fetch("consulta")
    assert route.call_count == 2
