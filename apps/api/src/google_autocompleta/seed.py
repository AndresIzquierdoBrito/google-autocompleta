import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from google_autocompleta.config import get_settings
from google_autocompleta.data import (
    CURRENT_CONTENT_VERSION,
    PROMPT_SEEDS,
    V3_DAILY_EPOCH,
    legacy_daily_prompts,
    seeded_daily_prompts,
)
from google_autocompleta.database import build_engine, build_session_factory, create_schema
from google_autocompleta.models import Prompt, Puzzle


async def seed_database(session: AsyncSession) -> None:
    current_prompt_ids = {item.id for item in PROMPT_SEEDS}
    await session.execute(
        update(Prompt).where(Prompt.id.not_in(current_prompt_ids)).values(is_active=False)
    )
    existing_prompts = {item.id: item for item in (await session.scalars(select(Prompt))).all()}
    for item in PROMPT_SEEDS:
        existing = existing_prompts.get(item.id)
        if existing is None:
            session.add(
                Prompt(
                    id=item.id,
                    category=item.category,
                    text=item.text,
                    fallback_answers=item.answers,
                    is_active=True,
                )
            )
        else:
            existing.is_active = True

    existing_dates = set(
        (
            await session.scalars(select(Puzzle.puzzle_date).where(Puzzle.puzzle_date.is_not(None)))
        ).all()
    )
    captured_at = datetime.now(UTC)
    await session.execute(
        update(Puzzle)
        .where(
            Puzzle.puzzle_date.is_(None),
            Puzzle.content_version != CURRENT_CONTENT_VERSION,
        )
        .values(random_eligible=False, approval_status="legacy")
    )
    existing_random_prompt_ids = set(
        (await session.scalars(select(Puzzle.prompt_id).where(Puzzle.puzzle_date.is_(None)))).all()
    )
    for item in PROMPT_SEEDS:
        if item.id not in existing_random_prompt_ids:
            session.add(
                Puzzle(
                    id=str(uuid4()),
                    prompt_id=item.id,
                    puzzle_date=None,
                    answers=item.answers,
                    source="snapshot",
                    captured_at=captured_at,
                    expires_at=None,
                    prompt_text=item.text,
                    aliases=item.aliases or {},
                    content_version=CURRENT_CONTENT_VERSION,
                    random_eligible=item.eligibility == "random",
                    approval_status="approved",
                )
            )
    scheduled = [
        *legacy_daily_prompts(),
        (V3_DAILY_EPOCH - timedelta(days=1), PROMPT_SEEDS[0]),
        *seeded_daily_prompts(),
    ]
    for puzzle_date, item in scheduled:
        if puzzle_date not in existing_dates:
            is_v3_daily = puzzle_date >= V3_DAILY_EPOCH
            session.add(
                Puzzle(
                    id=str(uuid4()),
                    prompt_id=item.id,
                    puzzle_date=puzzle_date,
                    answers=item.answers,
                    source="snapshot" if is_v3_daily else "legacy-snapshot",
                    captured_at=captured_at,
                    expires_at=None,
                    prompt_text=item.text,
                    aliases=item.aliases or {},
                    content_version=CURRENT_CONTENT_VERSION if is_v3_daily else "legacy",
                    random_eligible=False,
                    approval_status="approved" if is_v3_daily else "legacy",
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
