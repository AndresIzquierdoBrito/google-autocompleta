from datetime import datetime
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine

from google_autocompleta.database import build_engine, create_schema


async def _legacy_schema(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        await connection.execute(
            text(
                """
                CREATE TABLE prompts (
                    id VARCHAR(80) PRIMARY KEY,
                    category VARCHAR(32) NOT NULL,
                    text VARCHAR(160) NOT NULL,
                    fallback_answers JSON NOT NULL,
                    is_active BOOLEAN NOT NULL
                )
                """
            )
        )
        await connection.execute(
            text(
                """
                CREATE TABLE puzzles (
                    id VARCHAR(36) PRIMARY KEY,
                    prompt_id VARCHAR(80) NOT NULL,
                    puzzle_date DATE,
                    answers JSON NOT NULL,
                    source VARCHAR(24) NOT NULL,
                    captured_at DATETIME NOT NULL,
                    expires_at DATETIME,
                    FOREIGN KEY(prompt_id) REFERENCES prompts(id)
                )
                """
            )
        )
        await connection.execute(
            text(
                """
                CREATE TABLE games (
                    id VARCHAR(36) PRIMARY KEY,
                    mode VARCHAR(16) NOT NULL,
                    selected_category VARCHAR(32),
                    requested_date DATE,
                    round_number INTEGER NOT NULL,
                    total_rounds INTEGER NOT NULL,
                    score INTEGER NOT NULL,
                    status VARCHAR(20) NOT NULL,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL,
                    expires_at DATETIME NOT NULL
                )
                """
            )
        )
        await connection.execute(
            text(
                """
                CREATE TABLE game_rounds (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    game_id VARCHAR(36) NOT NULL,
                    round_number INTEGER NOT NULL,
                    puzzle_id VARCHAR(36) NOT NULL,
                    found_ranks JSON NOT NULL,
                    guesses JSON NOT NULL,
                    misses INTEGER NOT NULL,
                    score INTEGER NOT NULL,
                    status VARCHAR(20) NOT NULL,
                    FOREIGN KEY(game_id) REFERENCES games(id),
                    FOREIGN KEY(puzzle_id) REFERENCES puzzles(id)
                )
                """
            )
        )
        await connection.execute(
            text(
                "INSERT INTO prompts (id, category, text, fallback_answers, is_active) "
                "VALUES ('legacy', 'comida', 'qué comer', '[]', 1)"
            )
        )
        await connection.execute(
            text(
                "INSERT INTO puzzles "
                "(id, prompt_id, answers, source, captured_at) "
                "VALUES ('puzzle', 'legacy', '[]', 'legacy', :captured_at)"
            ),
            {"captured_at": datetime.now()},
        )
        await connection.execute(
            text(
                "INSERT INTO games "
                "(id, mode, round_number, total_rounds, score, status, "
                "created_at, updated_at, expires_at) "
                "VALUES ('game', 'archive', 1, 1, 0, 'playing', "
                ":created_at, :created_at, :created_at)"
            ),
            {"created_at": datetime.now()},
        )


async def test_create_schema_migrates_legacy_sqlite(tmp_path: Path) -> None:
    engine = build_engine(f"sqlite+aiosqlite:///{tmp_path / 'legacy.sqlite3'}")
    try:
        await _legacy_schema(engine)
        await create_schema(engine)

        async with engine.connect() as connection:
            columns = await connection.run_sync(
                lambda sync_connection: {
                    table: {
                        column["name"] for column in inspect(sync_connection).get_columns(table)
                    }
                    for table in ("prompts", "puzzles", "games", "game_rounds")
                }
            )
            assert "prompt_text" in columns["puzzles"]
            assert "planned_puzzle_ids" in columns["games"]
            assert "version" in columns["game_rounds"]
            backfilled = await connection.execute(
                text(
                    "SELECT p.match_config, z.aliases, z.content_version, "
                    "g.planned_puzzle_ids, g.version, r.version "
                    "FROM prompts p, puzzles z, games g "
                    "LEFT JOIN game_rounds r ON r.game_id = g.id"
                )
            )
            values = backfilled.one()
            assert values == ("{}", "{}", "legacy", "[]", 1, None)
    finally:
        await engine.dispose()
