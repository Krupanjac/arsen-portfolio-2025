---
name: ship-check
description: Pre-PR checklist for the portfolio. Runs the verify loop, checks the change in the Preview (themes, languages, widths, play mode), updates docs and the roadmap, and writes the PR. Use before opening or updating any pull request.
---

# Ship check

## 1. Automated checks

- Run `npm run verify`; it must pass. Put the result in the PR: test count, and the "Initial total" line from the build.
- Compare the bundle with `master` (733 kB raw at the time of writing). Explain any growth over 10 kB.

## 2. In the Preview

Use Wonder's Preview, or `npm start`. In Wonder, agents can check with the Preview tools (read, screenshot, click). Check what you changed, plus:

- [ ] dark theme (the default) and light theme, using the nav toggle
- [ ] EN and SR, using the language toggle: no untranslated text, nothing overflowing
- [ ] ~375 px wide and desktop
- [ ] the nav scroll-spy highlights the right section, and the anchor links land correctly
- [ ] Play hides the page, and the ✕ button brings it back
- [ ] no new console errors. Without the API, 404s for `/api/posts` and `/api/session` are expected
- [ ] with `prefers-reduced-motion: reduce` emulated, any new animation calms down
- [ ] new interactive elements are reachable with Tab and show a visible focus ring; Esc closes dialogs

## 3. Docs

- Behaviour or architecture changed: update `docs/ARCHITECTURE.md`.
- Commands, setup or secrets changed: update `docs/DEVELOPMENT.md`, and `AGENTS.md` if agents need to know.
- A roadmap item shipped: mark it ✅ (PR #) in `docs/ROADMAP.md`. New problems you found go in with the next free ID.

## 4. Commit and PR

- Write commits in Conventional Commits style (`feat(scope): …`, `fix: …`, `docs: …`) and cite ROADMAP IDs.
- Open the PR against `master` and fill in `.github/pull_request_template.md`.
- Once CI is green, open the Cloudflare preview link the bot posts; that preview has a working `/api`.
- If the PR includes a D1 migration, say so at the top. The owner applies it with `--remote` before merging.
