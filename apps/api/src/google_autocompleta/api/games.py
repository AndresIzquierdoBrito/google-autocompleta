from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from google_autocompleta.api.dependencies import get_game_service
from google_autocompleta.database import get_session
from google_autocompleta.schemas import CreateGameRequest, GameState, GuessRequest
from google_autocompleta.services import GameService

router = APIRouter(prefix="/games", tags=["games"])


@router.post("", response_model=GameState, status_code=201)
async def create_game(
    payload: CreateGameRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    service: Annotated[GameService, Depends(get_game_service)],
) -> GameState:
    return await service.create_game(session, payload)


@router.get("/{game_id}", response_model=GameState)
async def get_game(
    game_id: str,
    session: Annotated[AsyncSession, Depends(get_session)],
    service: Annotated[GameService, Depends(get_game_service)],
) -> GameState:
    return await service.get_game(session, game_id)


@router.post("/{game_id}/guesses", response_model=GameState)
async def submit_guess(
    game_id: str,
    payload: GuessRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    service: Annotated[GameService, Depends(get_game_service)],
) -> GameState:
    return await service.submit_guess(session, game_id, payload.guess)


@router.post("/{game_id}/give-up", response_model=GameState)
async def give_up(
    game_id: str,
    session: Annotated[AsyncSession, Depends(get_session)],
    service: Annotated[GameService, Depends(get_game_service)],
) -> GameState:
    return await service.give_up(session, game_id)


@router.post("/{game_id}/next-round", response_model=GameState)
async def next_round(
    game_id: str,
    session: Annotated[AsyncSession, Depends(get_session)],
    service: Annotated[GameService, Depends(get_game_service)],
) -> GameState:
    return await service.next_round(session, game_id)
