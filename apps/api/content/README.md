# Frozen content workflow

`manifest.json` is the versioned editorial contract for publishable boards.
`boards-v3.json` contains the current 210-board localized pack: 25 Random and
five scheduled Daily boards per category. The current pack was promoted from
the v5 English-source audit using the first ten family-safe candidates per
prompt. New imports must add ten normalized-unique completions,
provenance/adaptation metadata, alias rules, and playtest evidence before
setting `approval_status` to `approved`.

Run `pnpm api:content` in CI. The validator simulates one- and two-token
production matching, rejects accidental four-or-more-slot structural combos,
and checks the exact category/eligibility split. Prompt formats come from
English autocomplete frames translated into Spanish and frozen in this
repository; production never fetches suggestions live.

The applied pack is reproducible with `make promote-audit-v5`, which selects
the first ten family-safe candidates from the completed local v5 audit and
copies the result into `boards-v3.json`; run `make seed` afterward to update an
existing local database.
