from collections.abc import AsyncIterator
from typing import Any

from fastapi import Request
from sqlalchemy import Connection, event, inspect, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def build_engine(database_url: str) -> AsyncEngine:
    engine = create_async_engine(database_url, pool_pre_ping=True)
    if database_url.startswith("sqlite"):
        event.listen(engine.sync_engine, "connect", _enable_sqlite_foreign_keys)
    return engine


def _enable_sqlite_foreign_keys(dbapi_connection: Any, _: Any) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def build_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    factory: async_sessionmaker[AsyncSession] = request.app.state.session_factory
    async with factory() as session:
        yield session


async def create_schema(engine: AsyncEngine) -> None:
    from google_autocompleta import models  # noqa: F401

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        # ``create_all`` is intentionally not a migration tool: it leaves an
        # existing table unchanged when new model columns are introduced. The
        # app historically used this function as its only startup setup, so a
        # number of local SQLite databases can be missing the gameplay-v2
        # snapshot columns. Apply the small, additive compatibility migration
        # before seed data is written. The versioned Alembic migration remains
        # the canonical migration for new deployments.
        await connection.run_sync(_upgrade_legacy_sqlite_schema)


def _upgrade_legacy_sqlite_schema(connection: Connection) -> None:
    """Add columns introduced after the original ``create_all`` schema.

    This is deliberately limited to SQLite, the database supported by the
    bundled app configuration. It is idempotent and safe for both a legacy
    database and a freshly-created database (where every column already
    exists). Existing rows are backfilled with the same values as the Alembic
    gameplay-v2 migration so ORM reads and writes are immediately valid.
    """

    if connection.dialect.name != "sqlite":
        return

    columns_by_table: dict[str, dict[str, str]] = {
        "prompts": {"match_config": "JSON"},
        "puzzles": {
            "prompt_text": "VARCHAR(160)",
            "aliases": "JSON",
            "content_version": "VARCHAR(24)",
            "matcher_version": "VARCHAR(24)",
            "random_eligible": "BOOLEAN",
            "approval_status": "VARCHAR(16)",
            "match_index": "JSON",
        },
        "games": {
            "planned_puzzle_ids": "JSON",
            "round_summaries": "JSON",
            "content_version": "VARCHAR(24)",
            "version": "INTEGER",
        },
        "game_rounds": {"version": "INTEGER"},
    }

    inspector = inspect(connection)
    for table_name, columns in columns_by_table.items():
        existing = {column["name"] for column in inspector.get_columns(table_name)}
        for column_name, column_type in columns.items():
            if column_name not in existing:
                connection.execute(
                    text(f'ALTER TABLE "{table_name}" ADD COLUMN "{column_name}" {column_type}')
                )
                existing.add(column_name)

    connection.execute(text("UPDATE prompts SET match_config = '{}' WHERE match_config IS NULL"))
    connection.execute(text("UPDATE puzzles SET aliases = '{}' WHERE aliases IS NULL"))
    connection.execute(text("UPDATE puzzles SET match_index = '{}' WHERE match_index IS NULL"))
    connection.execute(
        text("UPDATE puzzles SET content_version = 'legacy' WHERE content_version IS NULL")
    )
    connection.execute(
        text("UPDATE puzzles SET matcher_version = 'v1' WHERE matcher_version IS NULL")
    )
    connection.execute(
        text(
            "UPDATE puzzles SET random_eligible = CASE WHEN puzzle_date IS NULL THEN 1 ELSE 0 END "
            "WHERE random_eligible IS NULL"
        )
    )
    connection.execute(
        text("UPDATE puzzles SET approval_status = 'legacy' WHERE approval_status IS NULL")
    )
    connection.execute(
        text("UPDATE games SET planned_puzzle_ids = '[]' WHERE planned_puzzle_ids IS NULL")
    )
    connection.execute(
        text("UPDATE games SET round_summaries = '[]' WHERE round_summaries IS NULL")
    )
    connection.execute(
        text("UPDATE games SET content_version = 'legacy' WHERE content_version IS NULL")
    )
    connection.execute(text("UPDATE games SET version = 1 WHERE version IS NULL"))
    connection.execute(text("UPDATE game_rounds SET version = 1 WHERE version IS NULL"))
