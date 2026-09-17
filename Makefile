.PHONY: install dev api web check seed audit audit-v3 audit-v5-english audit-prompts promote-audit-v5

UV_RUNNER := $(CURDIR)/scripts/uv-runner.sh
EDITORIAL_DIR := $(CURDIR)/.agents/editorial

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

audit: audit-prompts

audit-v3:
	cd apps/api && PYTHONPATH=src $(UV_RUNNER) run python scripts/audit_content.py --output $(EDITORIAL_DIR)/audit-v3-latest.json --workers 6

audit-v5-english:
	cd apps/api && PYTHONPATH=src $(UV_RUNNER) run python scripts/audit_prompt_overhaul.py --prompts-path $(EDITORIAL_DIR)/overhaul-v5-prompts.json --prompt-field english_source_prompts --exact-only --workers 2 --delay-seconds 0.3 --initial-delay-seconds 30 --retries 1 --retry-backoff-seconds 15 --output $(EDITORIAL_DIR)/audit-v5-english-sources-latest.json

audit-prompts:
	cd apps/api && PYTHONPATH=src $(UV_RUNNER) run python scripts/audit_prompt_overhaul.py --prompts-path $(EDITORIAL_DIR)/overhaul-v5-prompts.json --prompt-field prompts --workers 2 --delay-seconds 0.3 --initial-delay-seconds 30 --retries 1 --retry-backoff-seconds 15 --output $(EDITORIAL_DIR)/audit-v5-prompts-latest.json

promote-audit-v5:
	cd apps/api && PYTHONPATH=src $(UV_RUNNER) run python scripts/promote_audit_pack.py --output $(EDITORIAL_DIR)/boards-v5-curated.json
	cp $(EDITORIAL_DIR)/boards-v5-curated.json apps/api/content/boards-v3.json
