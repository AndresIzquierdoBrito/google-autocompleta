"""Adopt databases created before Alembic became the production migrator.

The API historically used ``create_schema`` directly.  Those databases have
the application tables, but no ``alembic_version`` row.  Running the initial
Alembic migration against one of them attempts to create the tables again and
prevents the API process from starting.  This module recognizes that known
shape, upgrades it with the existing additive compatibility path, and stamps
the result at the current migration head.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sqlite3
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import Connection, inspect
from sqlalchemy.engine import make_url

from google_autocompleta.config import get_settings
from google_autocompleta.database import build_engine, create_schema

logger = logging.getLogger(__name__)

BootstrapStatus = Literal["new", "versioned", "adopted"]

LEGACY_TABLES = frozenset({"prompts", "puzzles", "games", "game_rounds"})
ALLOWED_UNVERSIONED_TABLES = LEGACY_TABLES | {"alembic_version"}
LEGACY_COLUMNS = {
    "prompts": frozenset({"id", "category", "text", "fallback_answers", "is_active"}),
    "puzzles": frozenset(
        {"id", "prompt_id", "puzzle_date", "answers", "source", "captured_at", "expires_at"}
    ),
    "games": frozenset(
        {
            "id",
            "mode",
            "selected_category",
            "requested_date",
            "round_number",
            "total_rounds",
            "score",
            "status",
            "created_at",
            "updated_at",
            "expires_at",
        }
    ),
    "game_rounds": frozenset(
        {
            "id",
            "game_id",
            "round_number",
            "puzzle_id",
            "found_ranks",
            "guesses",
            "misses",
            "score",
            "status",
        }
    ),
}
GAMEPLAY_V2_COLUMNS = {
    "prompts": frozenset({"match_config"}),
    "puzzles": frozenset(
        {
            "prompt_text",
            "aliases",
            "content_version",
            "matcher_version",
            "random_eligible",
            "approval_status",
            "match_index",
        }
    ),
    "games": frozenset({"planned_puzzle_ids", "round_summaries", "content_version", "version"}),
    "game_rounds": frozenset({"version"}),
}


class MigrationBootstrapError(RuntimeError):
    """Raised when an unversioned database is not a known legacy shape."""


@dataclass(frozen=True, slots=True)
class DatabaseSnapshot:
    current_revision: str | None
    tables: frozenset[str]
    columns: dict[str, frozenset[str]]


def _snapshot_connection(
    connection: Connection,
) -> tuple[frozenset[str], dict[str, frozenset[str]]]:
    inspector = inspect(connection)
    tables = frozenset(
        table for table in inspector.get_table_names() if not table.startswith("sqlite_")
    )
    columns = {
        table: frozenset(column["name"] for column in inspector.get_columns(table))
        for table in tables
    }
    return tables, columns


async def _inspect_database(database_url: str) -> DatabaseSnapshot:
    engine = build_engine(database_url)
    try:
        async with engine.connect() as connection:
            current_revision = await connection.run_sync(
                lambda sync_connection: MigrationContext.configure(
                    sync_connection
                ).get_current_revision()
            )
            tables, columns = await connection.run_sync(_snapshot_connection)
            return DatabaseSnapshot(current_revision, tables, columns)
    finally:
        await engine.dispose()


def _database_path(database_url: str) -> Path | None:
    parsed = make_url(database_url)
    if parsed.get_backend_name() != "sqlite" or not parsed.database:
        return None
    if parsed.database == ":memory:" or parsed.database.startswith("file:"):
        return None
    return Path(parsed.database).expanduser()


def _backup_database(database_url: str) -> Path | None:
    source_path = _database_path(database_url)
    if source_path is None or not source_path.is_file():
        return None

    backup_path = source_path.with_name(f"{source_path.name}.pre-alembic-backup")
    if backup_path.exists():
        logger.info("Legacy database backup already exists at %s", backup_path)
        return backup_path

    source_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=source_path.parent,
            prefix=f".{backup_path.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
        with (
            sqlite3.connect(source_path, timeout=30) as source,
            sqlite3.connect(temporary_path, timeout=30) as destination,
        ):
            source.execute("PRAGMA busy_timeout=30000")
            source.backup(destination)
        os.replace(temporary_path, backup_path)
        temporary_path = None
        logger.info("Created one-time legacy database backup at %s", backup_path)
        return backup_path
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def _alembic_config(database_url: str) -> Config:
    api_root = Path(__file__).resolve().parents[2]
    config = Config(str(api_root / "alembic.ini"))
    config.set_main_option("script_location", str(api_root / "migrations"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def _stamp_head(database_url: str) -> None:
    command.stamp(_alembic_config(database_url), "head")


def _validate_legacy_shape(snapshot: DatabaseSnapshot) -> None:
    unexpected_tables = snapshot.tables - ALLOWED_UNVERSIONED_TABLES
    if unexpected_tables:
        raise MigrationBootstrapError(
            "Unversioned database contains unknown tables: " + ", ".join(sorted(unexpected_tables))
        )
    missing_tables = LEGACY_TABLES - snapshot.tables
    if missing_tables:
        raise MigrationBootstrapError(
            "Unversioned database is missing application tables: "
            + ", ".join(sorted(missing_tables))
        )
    missing_columns = {
        table: sorted(columns - snapshot.columns.get(table, frozenset()))
        for table, columns in LEGACY_COLUMNS.items()
        if columns - snapshot.columns.get(table, frozenset())
    }
    if missing_columns:
        details = "; ".join(
            f"{table}: {', '.join(columns)}" for table, columns in missing_columns.items()
        )
        raise MigrationBootstrapError(f"Unversioned database has an incomplete schema ({details}).")


async def _upgrade_legacy_schema(database_url: str) -> None:
    engine = build_engine(database_url)
    try:
        await create_schema(engine)
    finally:
        await engine.dispose()

    upgraded = await _inspect_database(database_url)
    missing_columns = {
        table: sorted(columns - upgraded.columns.get(table, frozenset()))
        for table, columns in GAMEPLAY_V2_COLUMNS.items()
        if columns - upgraded.columns.get(table, frozenset())
    }
    if missing_columns:
        details = "; ".join(
            f"{table}: {', '.join(columns)}" for table, columns in missing_columns.items()
        )
        raise MigrationBootstrapError(f"Legacy schema adoption did not complete ({details}).")


async def bootstrap_database(database_url: str) -> BootstrapStatus:
    """Prepare a database for ``alembic upgrade head`` and report its state."""

    snapshot = await _inspect_database(database_url)
    if snapshot.current_revision is not None:
        logger.info("Database already has Alembic revision %s", snapshot.current_revision)
        return "versioned"

    if not snapshot.tables or snapshot.tables == frozenset({"alembic_version"}):
        logger.info("Database is new; Alembic will create the schema")
        return "new"

    _validate_legacy_shape(snapshot)
    _backup_database(database_url)
    logger.info("Adopting recognized pre-Alembic database schema")
    await _upgrade_legacy_schema(database_url)
    await asyncio.to_thread(_stamp_head, database_url)
    logger.info("Legacy database adopted and stamped at Alembic head")
    return "adopted"


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    settings = get_settings()
    asyncio.run(bootstrap_database(settings.database_url))


if __name__ == "__main__":
    main()
