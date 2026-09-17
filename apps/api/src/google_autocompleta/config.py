from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    database_url: str = "sqlite+aiosqlite:///./google_autocompleta.db"
    allowed_origins: str = (
        "http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://127.0.0.1:19006"
    )
    google_suggest_url: str = "https://suggestqueries.google.com/complete/search"
    google_timeout_seconds: float = Field(default=3.0, ge=0.5, le=15)
    suggestion_cache_seconds: int = Field(default=21_600, ge=60)
    audit_enabled: bool = True
    session_ttl_hours: int = Field(default=24, ge=1, le=168)
    daily_timezone: str = "Europe/Madrid"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def cors_origin_regex(self) -> str | None:
        if self.app_env not in {"development", "dev"}:
            return None
        # Expo may serve web from localhost, loopback, or the developer's
        # private LAN address. Keep this convenience limited to development.
        return (
            r"^https?://(?:localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
            r"192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}):\d{1,5}$"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
