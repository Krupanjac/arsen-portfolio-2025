## What and why

<!-- One or two sentences. Cite ROADMAP IDs (e.g. BUG-1) where relevant. -->

## How I checked it

- [ ] `npm run verify` passes
- [ ] Looked at it in the Preview or the Cloudflare branch preview: dark + light, EN + SR, phone + desktop width
- [ ] New or changed copy is in `public/i18n/en.json` **and** `sr.json`
- [ ] New browser-only code is behind `isPlatformBrowser`; new animation respects `prefers-reduced-motion`
- [ ] Docs updated (`AGENTS.md`, `docs/*`) if behaviour, commands or architecture changed; ROADMAP status updated

## Screenshots

<!-- Before and after, for anything visual. -->

## Deploy notes

<!-- A D1 migration the owner must apply with --remote before merging? A new secret or binding? Otherwise "None". -->
