import asyncio
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from google_autocompleta.config import get_settings
from google_autocompleta.data import PROMPT_SEEDS, seeded_daily_prompts
from google_autocompleta.database import build_engine, build_session_factory, create_schema
from google_autocompleta.models import Prompt, Puzzle


async def seed_database(session: AsyncSession) -> None:
    existing_prompt_ids = set((await session.scalars(select(Prompt.id))).all())
    for item in PROMPT_SEEDS:
        if item.id not in existing_prompt_ids:
            session.add(
                Prompt(
                    id=item.id,
                    category=item.category,
                    text=item.text,
                    fallback_answers=item.answers,
                    is_active=True,
                )
            )

    existing_dates = set(
        (
            await session.scalars(select(Puzzle.puzzle_date).where(Puzzle.puzzle_date.is_not(None)))
        ).all()
    )
    captured_at = datetime.now(UTC)
    for puzzle_date, item in seeded_daily_prompts():
        if puzzle_date not in existing_dates:
            session.add(
                Puzzle(
                    id=str(uuid4()),
                    prompt_id=item.id,
                    puzzle_date=puzzle_date,
                    answers=item.answers,
                    source="snapshot",
                    captured_at=captured_at,
                    expires_at=None,
                )
            )
    await session.commit()


async def main() -> None:
    settings = get_settings()
    engine = build_engine(settings.database_url)
    await create_schema(engine)
    factory = build_session_factory(engine)
    async with factory() as session:
        await seed_database(session)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
