FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY migrations ./migrations
COPY alembic.ini ./alembic.ini
COPY src ./src
RUN uv sync --frozen --no-dev

EXPOSE 8000
CMD ["fastapi", "run", "src/google_autocompleta/main.py", "--host", "0.0.0.0", "--port", "8000"]

