import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from google_autocompleta.api import categories, daily, games
from google_autocompleta.config import Settings, get_settings
from google_autocompleta.database import build_engine, build_session_factory, create_schema
from google_autocompleta.providers import GoogleSuggestProvider
from google_autocompleta.seed import seed_database
from google_autocompleta.services import GameError, GameService

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    current_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = build_engine(current_settings.database_url)
        session_factory = build_session_factory(engine)
        await create_schema(engine)
        async with session_factory() as session:
            await seed_database(session)
        provider = GoogleSuggestProvider(
            url=current_settings.google_suggest_url,
            timeout_seconds=current_settings.google_timeout_seconds,
            cache_seconds=current_settings.suggestion_cache_seconds,
        )
        app.state.engine = engine
        app.state.session_factory = session_factory
        app.state.game_service = GameService(current_settings, provider)
        # Materialize today's reviewed fallback snapshot before serving
        # traffic. This transaction is separate from seed/setup and is safe to
        # repeat after a restart; historical dates are never backfilled here.
        try:
            async with session_factory() as session:
                await app.state.game_service.ensure_daily_puzzle(session)
                await session.commit()
        except Exception:
            # A missing approved snapshot should not take the whole API offline;
            # the client receives an explicit unavailable/retry state.
            logger.exception("Initial daily puzzle generation failed")
        yield
        await engine.dispose()

    app = FastAPI(
        title="Google Autocompleta API",
        version="1.0.0",
        description="API de juego con sugerencias de búsqueda en español.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=current_settings.cors_origins,
        allow_origin_regex=current_settings.cors_origin_regex,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @app.exception_handler(GameError)
    async def handle_game_error(_: Request, exc: GameError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        first_error = exc.errors()[0] if exc.errors() else {}
        message = str(first_error.get("msg", "La petición no es válida."))
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "validation_error", "message": message}},
        )

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(categories.router, prefix="/api/v1")
    app.include_router(daily.router, prefix="/api/v1")
    app.include_router(games.router, prefix="/api/v1")
    return app


app = create_app()
