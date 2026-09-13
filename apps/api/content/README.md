# Frozen content workflow

`manifest.json` is the versioned editorial contract for publishable boards.
`boards-v3.json` contains the current 210-board localized pack: 25 Random and
five scheduled Daily boards per category. New imports must add ten
normalized-unique completions, provenance/adaptation metadata, alias rules,
and playtest evidence before setting `approval_status` to `approved`.

Run `pnpm api:content` in CI. The validator simulates one- and two-token
production matching, rejects accidental four-or-more-slot structural combos,
and checks the exact category/eligibility split. Prompt formats are inspired by
Google Feud but localized and frozen in this repository; production never
fetches suggestions live.
