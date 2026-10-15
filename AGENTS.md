# AGENTS.md

Working guide for AI agents (Claude Code, Gemini, Codex, Wonder…) and humans in this repo.
Keep it short and true: when something here stops matching the code, fix this file in the same PR.

## What this is

Arsen Đurđev's portfolio, **krupanjac.dev**. It's an Angular 19 single-page site, prerendered at build time and served as static files by **Cloudflare Pages**. A few **Pages Functions** (`functions/api/`) back a tiny CMS: Projects and Experience entries live in **D1**, the admin login lives in **KV**, and images live on **ImageKit**.

- How it fits together: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Setup, secrets, local full-stack, deploy: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- Known issues and the improvement plan: [docs/ROADMAP.md](docs/ROADMAP.md). Items have IDs (`BUG-2`, `SEC-1`…); cite them in commits and PRs.

## Commands

| Task | Command | Time | Notes |
|---|---|---|---|
| Install | `npm ci` | ~30 s | Node 22 LTS (what CI uses); Node 24 works locally |
| Run the site | Wonder Preview, or `npm start` | | http://localhost:4200. `ng serve` doesn't serve `/api/*`, so Projects/Experience are empty and login fails; see DEVELOPMENT.md |
| **Verify everything** | `npm run verify` | ~1.5 min | i18n check, shader compile check, unit tests, then a production build with prerender. Must pass before every PR; CI runs the same command |
| i18n check | `npm run check:i18n` | <1 s | Claude Code also runs it after every edit (`.claude/hooks/post-edit.mjs`) |
| Shader check | `npm run check:shaders` | ~2 s | Compiles and links every `*.frag.ts` in real WebGL2 (headless Chrome, SwiftShader); errors point at the `.ts` line |
| Shader renders | `npm run render:shaders` | ~3 s | One frame per shader into `tmp/shader-renders/*.png`, using the site's palette; `-- --theme both --quality 1 --time 40` |
| Shader bench | `npm run bench:shaders` | ~15 s | Relative cost; compare versions with `-- --shaders <old dir> --shaders src/app/gfx/shaders`. SwiftShader times only compare versions with each other |
| Unit tests | `npm run test:ci` | ~15 s | Karma, headless Chrome, single run |
| Build | `npm run build` | ~40 s | Also prerenders every route in Node, which makes it the SSR-safety check |

## Map

```
src/app/app.component.html   the whole page: #start #home #resume #experience #projects #about #contact, then the footer
src/app/layout/              page chrome: nav (scroll-spy, theme, language, Dashboard modal), hero, hero-render (the
                             WebGL2 stage), play button (fullscreen renderer), rail, loader, footer
src/app/gfx/                 WebGL2 engine (context, shaders, frame timer, resolution scaler, render loop), palette.ts,
                             gpu-surface + frame-hud wrappers, shaders/*.frag.ts
src/app/{home,experience,projects,about,contact}/   one folder per section
src/app/shared/              appTerminalTyping, appTooltip, markdown pipes
src/app/*.service.ts         BlogService (/api/posts), ImagekitService, PlayStateService, AuthService (unused)
src/styles.scss              theme tokens (CSS variables, incl. the --gfx-* renderer palette), helper classes, global rules
src/testing/                 provideTestDeps() for component specs
public/i18n/{en,sr}.json     all copy; the Serbian is in Latin script
public/                      robots.txt, sitemap.xml, _redirects, resume PDF (all served from the site root)
functions/api/               Pages Functions: login/logout/session, posts CRUD, imagekit-auth, _middleware
migrations/                  D1 schema, applied with wrangler d1 migrations
scripts/                     check-i18n.mjs, check-shaders.mjs (+ .page.mjs), gen.js (makes the bcrypt hash for an admin user)
```

## Rules the code won't tell you

1. **There is no `<router-outlet>`.** The site is one scrolling page assembled in `app.component.html`. Routes in `app.routes.ts` only shape prerendering and URLs; `/admin`, `/blog` and the auth guard never render (ROADMAP BUG-2). New content goes in a new **section**, not a new route; see the `add-section` playbook.
2. **Everything runs in Node first.** `npm run build` prerenders the app on the server. Wrap `window`, `document`, `localStorage`, observers and canvas/WebGL in an `isPlatformBrowser(platformId)` check, as the rest of the code does. An unguarded call breaks the build or ships broken HTML.
3. **All copy is translated.** Add every user-facing string to **both** `public/i18n/en.json` and `sr.json`. The standard markup is
   `<span appTerminalTyping data-i18n-key="SECTION.KEY">{{ 'SECTION.KEY' | translate }}</span>`.
   The directive retypes the text when the language changes, and `data-i18n-key` tells it which new value to read. Tooltips take a key: `appTooltip="TOOLTIP.X"`.
4. **Tailwind can't see the theme tokens.** The tokens are CSS variables in `src/styles.scss`, not in a Tailwind `@theme` block, so classes like `bg-accent`, `bg-accent/80`, `ring-accent` and `from-surface/70` produce **no CSS** (ROADMAP BUG-1). Until that's fixed, use the hand-written helpers (`text-accent`, `text-primary`, `text-secondary`, `bg-surface`, `bg-surface-alt`, `border-base`, `border-divider`) or arbitrary values (`bg-[var(--color-accent)]`). Check both themes: `data-theme="dark"` (the default) and light.
5. **Projects and Experience are data, not code.** They're rows in the D1 `posts` table (`category` is `'project'` or `'experience'`), edited in the nav's Dashboard modal. Don't hardcode entries. `created_at` is in epoch **seconds**; multiply by 1000 for the `date` pipe.
6. **Functions run on Workers, not Node.** They're plain ES modules using Web APIs only (`crypto.subtle`, `fetch`). Protect any write with `verifyJWT` (from `functions/api/login.js`) and the helpers in `_auth.js`. Never log request bodies, tokens or secrets.
7. **Hands off production.** Don't run `wrangler … --remote` or `wrangler pages deploy`, and don't write to production KV or D1; ask the user. `.claude/settings.json` makes Claude Code ask before any wrangler command. Preview deployments most likely share the production D1 and KV, since `wrangler.toml` has no `[env.preview]`.
8. **Mind the bundle budget.** The initial bundle is 733 kB against a 500 kB warning (ROADMAP PERF-1). Don't add dependencies without a reason, and use `@defer` or lazy imports for anything below the fold.
9. **Keep diffs focused.** No formatter is configured yet, so don't reformat files you aren't changing.
10. **Respect reduced motion** in anything new that animates (`prefers-reduced-motion: reduce`). The renderer draws a single still frame under it.
11. **Theme selectors in component stylesheets use `:host-context()`.** Write `:host-context(html[data-theme='dark']) .x` or `:host-context(html:not([data-theme='dark'])) .x`. A `:root[...] .x` selector inside a component's SCSS never matches, because Angular's emulated encapsulation tags the `:root` compound. That's how the hero's light-theme scrim was silently dead.
12. **Shader colours come from the palette.** Scene colours are the `--gfx-*` tokens in `src/styles.scss`, fed in by `gfx/palette.ts`. Don't hardcode hues in GLSL. Add a token (plus its fallback in `palette.ts`), or reuse one. Uniforms a shader doesn't declare are ignored, so passing the whole palette is fine.

## Definition of done

- [ ] `npm run verify` passes
- [ ] New or changed copy exists in both `en.json` and `sr.json`
- [ ] Checked in the Preview in dark and light themes, EN and SR, at ~375 px and desktop widths
- [ ] Every new browser-only API call sits behind an `isPlatformBrowser` check
- [ ] New animation respects `prefers-reduced-motion`
- [ ] Docs updated if behavior, commands or architecture changed (this file too)
- [ ] Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`…), and the PR cites ROADMAP IDs

## Playbooks

Recipes for recurring jobs live in `.claude/skills/<name>/SKILL.md`. Claude Code loads them as skills (`/i18n-copy`…). Other agents can read them as plain markdown.

| Playbook | Use it when |
|---|---|
| `i18n-copy` | adding or changing user-facing text |
| `add-section` | adding a section to the one-page layout |
| `content-posts` | touching Projects/Experience data, the Dashboard or the D1 schema |
| `pages-function` | adding or changing an `/api/*` endpoint |
| `ship-check` | before opening or updating a PR |

## Environment notes

- **Line endings:** the repo stores LF and Windows checkouts get CRLF (`core.autocrlf`). Keep a file's existing line endings when you edit it.
- **Running the app in Wonder:** use the Preview (run profile: setup `npm ci`, run `node node_modules/@angular/cli/bin/ng.js serve`, port 4200). Calling the CLI directly avoids npm's `cmd.exe` and `ng.cmd` layers on Windows, which kept stops from completing. Don't start `ng serve` from a shell.
- **Branch previews:** Cloudflare Pages builds every pushed branch at `https://<branch>.krupanjac.pages.dev` (PR #8's is `wonder-sottsass.krupanjac.pages.dev`). It's the quickest way to see a change with a working `/api`.
