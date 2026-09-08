from collections.abc import Iterator
from pathlib import Path

import pytest
import respx
from fastapi.testclient import TestClient

from google_autocompleta.config import Settings
from google_autocompleta.main import create_app


@pytest.fixture
def api_client(tmp_path: Path) -> Iterator[TestClient]:
    database_path = tmp_path / "test.sqlite3"
    settings = Settings(
        app_env="test",
        database_url=f"sqlite+aiosqlite:///{database_path}",
        allowed_origins="http://localhost:8081,http://127.0.0.1:8081",
        google_suggest_url="https://suggest.test/complete",
        google_timeout_seconds=0.5,
    )
    with respx.mock(assert_all_called=False) as router:
        router.get("https://suggest.test/complete").respond(status_code=503)
        with TestClient(create_app(settings)) as client:
            yield client
