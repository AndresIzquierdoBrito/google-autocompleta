.PHONY: install dev api web check seed

UV_RUNNER := $(CURDIR)/scripts/uv-runner.sh

install:
	pnpm install
	cd apps/api && $(UV_RUNNER) sync --all-groups

dev:
	@echo "Ejecuta 'make api' y 'make web' en dos terminales."

api:
	cd apps/api && $(UV_RUNNER) run fastapi dev src/google_autocompleta/main.py

web:
	pnpm --dir apps/client web

check:
	pnpm check

seed:
	cd apps/api && $(UV_RUNNER) run python -m google_autocompleta.seed
