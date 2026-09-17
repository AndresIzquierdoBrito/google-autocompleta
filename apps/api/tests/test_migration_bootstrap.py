import asyncio
from pathlib import Path

import pytest
from alembic import command
from sqlalchemy import text
from test_database import _legacy_schema

from google_autocompleta.database import build_engine
from google_autocompleta.migration_bootstrap import (
    MigrationBootstrapError,
    _alembic_config,
    bootstrap_database,
)


def _upgrade(database_url: str) -> None:
    command.upgrade(_alembic_config(database_url), "head")


@pytest.mark.asyncio
async def test_empty_database_runs_normal_alembic_upgrade(tmp_path: Path) -> None:
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'empty.sqlite3'}"

    assert await bootstrap_database(database_url) == "new"
    await asyncio.to_thread(_upgrade, database_url)

    engine = build_engine(database_url)
    try:
        async with engine.connect() as connection:
            version = await connection.scalar(text("SELECT version_num FROM alembic_version"))
            tables = await connection.run_sync(
                lambda sync_connection: set(
                    sync_connection.dialect.get_table_names(sync_connection)
                )
            )
        assert version == "7f4c2d9a2e1f"
        assert {"prompts", "puzzles", "games", "game_rounds"} <= tables
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_legacy_database_is_backed_up_adopted_and_preserved(tmp_path: Path) -> None:
    database_path = tmp_path / "legacy.sqlite3"
    database_url = f"sqlite+aiosqlite:///{database_path}"
    engine = build_engine(database_url)
    try:
        await _legacy_schema(engine)
    finally:
        await engine.dispose()

    assert await bootstrap_database(database_url) == "adopted"
    assert database_path.with_name("legacy.sqlite3.pre-alembic-backup").is_file()

    engine = build_engine(database_url)
    try:
        async with engine.connect() as connection:
            counts = await connection.execute(
                text(
                    "SELECT "
                    "(SELECT count(*) FROM prompts), "
                    "(SELECT count(*) FROM puzzles), "
                    "(SELECT count(*) FROM games)"
                )
            )
            version = await connection.scalar(text("SELECT version_num FROM alembic_version"))
        assert counts.one() == (1, 1, 1)
        assert version == "7f4c2d9a2e1f"
    finally:
        await engine.dispose()

    assert await bootstrap_database(database_url) == "versioned"


@pytest.mark.asyncio
async def test_legacy_database_with_empty_version_table_is_adopted(tmp_path: Path) -> None:
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'legacy.sqlite3'}"
    engine = build_engine(database_url)
    try:
        await _legacy_schema(engine)
        async with engine.begin() as connection:
            await connection.execute(
                text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)")
            )
    finally:
        await engine.dispose()

    assert await bootstrap_database(database_url) == "adopted"


@pytest.mark.asyncio
async def test_partial_unversioned_database_is_rejected(tmp_path: Path) -> None:
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'partial.sqlite3'}"
    engine = build_engine(database_url)
    try:
        async with engine.begin() as connection:
            await connection.execute(
                text(
                    "CREATE TABLE prompts ("
                    "id VARCHAR(80) PRIMARY KEY, category VARCHAR(32) NOT NULL, "
                    "text VARCHAR(160) NOT NULL, fallback_answers JSON NOT NULL, "
                    "is_active BOOLEAN NOT NULL)"
                )
            )
    finally:
        await engine.dispose()

    with pytest.raises(MigrationBootstrapError, match="missing application tables"):
        await bootstrap_database(database_url)


@pytest.mark.asyncio
async def test_unknown_unversioned_table_is_rejected(tmp_path: Path) -> None:
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'unknown.sqlite3'}"
    engine = build_engine(database_url)
    try:
        async with engine.begin() as connection:
            await connection.execute(text("CREATE TABLE unrelated (id INTEGER PRIMARY KEY)"))
    finally:
        await engine.dispose()

    with pytest.raises(MigrationBootstrapError, match="unknown tables"):
        await bootstrap_database(database_url)
