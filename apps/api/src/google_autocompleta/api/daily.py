from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from google_autocompleta.api.dependencies import get_game_service
from google_autocompleta.database import get_session
from google_autocompleta.schemas import ArchivePuzzleOut, DailyCurrentOut
from google_autocompleta.services import GameService

router = APIRouter(prefix="/daily", tags=["daily"])


@router.get("/current", response_model=DailyCurrentOut)
async def current_daily(
    session: Annotated[AsyncSession, Depends(get_session)],
    service: Annotated[GameService, Depends(get_game_service)],
) -> DailyCurrentOut:
    current, number, timezone = await service.current_daily(session)
    return DailyCurrentOut(date=current, number=number, timezone=timezone)


@router.get("/archive", response_model=list[ArchivePuzzleOut])
async def list_archive(
    session: Annotated[AsyncSession, Depends(get_session)],
    service: Annotated[GameService, Depends(get_game_service)],
) -> list[ArchivePuzzleOut]:
    return await service.list_archive(session)
