from typing import cast

from fastapi import Request

from google_autocompleta.services import GameService


def get_game_service(request: Request) -> GameService:
    return cast(GameService, request.app.state.game_service)
