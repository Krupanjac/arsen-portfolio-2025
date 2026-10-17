# Development

Setup, day-to-day commands, secrets, deploys and content operations. For how the system fits together, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Prerequisites

- **Node.js 22 LTS.** CI uses 22, and Node 24 also works locally. Angular 19 supports `^18.19.1 || ^20.11.1 || >=22`.
- **npm.** Always install with `npm ci` so the lockfile is respected.
- **Chrome or Chromium** for the unit tests. Karma finds it automatically; otherwise set `CHROME_BIN`.
- **Optional:** [Wrangler](https://developers.cloudflare.com/workers/wrangler/) through `npx wrangler`, to run `/api` locally (see [Full stack locally](#full-stack-locally)).

## First run

```bash
npm ci
npm run verify     # ~1.5 min: i18n check, unit tests, production build + prerender
npm start          # http://localhost:4200. In Wonder, open the Preview instead
```

The Wonder run profile for this repo is: setup `npm ci`, run `node scripts/dev-full.mjs` (the full stack, see below), port `4200`.

Like that script, run commands call node directly rather than `npm start`. On Windows, npm runs scripts through `cmd.exe` and the `ng.cmd` batch shim. When Wonder stops the app, that batch job asks "Terminate batch job (Y/N)?" and waits, so Wonder can't confirm the server exited.

### What works without the API

Plain `npm start` (`ng serve`) serves only the Angular app. Everything renders except the parts that need `/api`; use the [full stack](#full-stack-locally) for those:

- **Projects and Experience** show their empty states, because `GET /api/posts` returns 404.
- **The Dashboard login** fails, because `/api/login` isn't there. The Turnstile widget also refuses `localhost` with the production site key.

To see those, use a [branch preview](#deploying), or run the [full stack locally](#full-stack-locally).

## The verify loop

| Command | Runs | Catches |
|---|---|---|
| `npm run check:i18n` | `scripts/check-i18n.mjs` | Locale keys missing from one side, empty values, `{{param}}` mismatches, keys used in `src/` but not defined. Warns about unused keys |
| `npm run check:shaders` | `scripts/check-shaders.mjs` in headless Chrome (SwiftShader WebGL2) | GLSL compile and link errors, reported at the `.frag.ts` line. Skips with a warning if WebGL2 is unavailable |
| `npm run test:ci` | Karma + Jasmine, headless Chrome, single run | Broken components and services |
| `npm run build` | Production build + prerender of every route in Node | Template type errors (`strictTemplates`), budget errors (>1 MB initial), browser APIs used on the server |
| `npm run verify` | All four, cheapest first | Everything above. CI runs this on every PR |

Common failures:

| Symptom | Fix |
|---|---|
| A spec fails with `NullInjectorError: No provider for TranslateService` / `HttpClient` | Add `providers: [provideTestDeps()]` (from `src/testing/test-providers.ts`) to `TestBed.configureTestingModule`, or extend that helper |
| The build fails while "Prerendering", with `window`/`document`/`localStorage is not defined` | Guard the code with `isPlatformBrowser(this.platformId)`, or move it to `ngAfterViewInit` behind the guard |
| `check:i18n` says `sr: missing X` | Add the key to `public/i18n/sr.json` in the same place as in `en.json` |
| `check:i18n` says `src/... references X, which en.json does not define` | Add the key to both catalogs, or fix the typo |
| "bundle initial exceeded maximum budget" **warning** | Expected until ROADMAP PERF-1: 793 kB against 500 kB. Only an **error** (over 1 MB) fails the build |

Claude Code also runs the i18n check after every file edit (`.claude/hooks/post-edit.mjs`) and reports failures back to the agent right away.

### Shader tools

The shader check, renderer and bench need no running app. They compile the app's own shader strings the way `ShaderSurface` does, in headless Chrome.

- `npm run render:shaders -- --theme both --quality 1 --time 40` writes one frame per shader to `tmp/shader-renders/`. Colours come from the `--gfx-*` tokens through `readPalette()`, the same path the site uses. Other flags: `--size 1280x720`, `--uniform uMouse=0.4,-0.2`, `--only hero-terrain`.
- `npm run bench:shaders -- --shaders <copy of an older shaders/> --shaders src/app/gfx/shaders` alternates frames between versions and reports median/p90 and the % change. SwiftShader runs on the CPU, so only compare versions with each other. Bench a few `--time` values: the cost depends on what the camera sees.
- Limits: SwiftShader won't show driver-specific bugs, and it only exercises the low cost path you ask for. Check real-GPU behaviour in the Preview.

## Full stack locally

One command runs the site with its API: Cloudflare Pages Functions, with a local D1 database and KV namespace.

```bash
npm run dev:full        # in Wonder, the Preview's run profile does this
```

- `scripts/dev-full.mjs` starts two servers:
  - `wrangler pages dev` on 127.0.0.1:8788, for the Functions and local bindings;
  - `ng serve` on 4200, which proxies `/api` to it (`proxy.conf.json`).
- Open http://localhost:4200. Hot reload works for the UI, and the Functions reload on save.
- Both servers start through node directly (Windows batch shims would block clean stops), and stopping the script stops the whole process tree.
- **The first run seeds the local state** with `scripts/seed-local.mjs` (`npm run seed:local` reruns it):
  - `.dev.vars`, if missing: a random `JWT_SECRET` and Turnstile's always-pass test secret;
  - the D1 schema from `migrations/`;
  - an admin login, whose password it prints;
  - Projects and Experience copied from the live site's public `GET /api/posts`, or two built-in samples when offline.
- Flags: `--user`, `--password`, `--posts <file|url>`, and `--force` to replace existing local posts.
- **Login on localhost** uses Turnstile's test site key, which pairs with that test secret (`login.component.ts`; production hostnames keep the real key).
- **Image uploads** need a real `IMAGEKIT_PRIVATE_KEY` in `.dev.vars`.
- **Everything stays in `.wrangler/state`.** Every wrangler call in these scripts passes `--local` (the seed refuses anything else), so nothing touches production.
- **To start over:** delete `.wrangler/state`, or `.dev.vars` as well, and run `npm run dev:full` again.

## Deploying

- **Production.** Merging to `master` deploys. Cloudflare Pages (project `krupanjac`) builds through its Git integration. The build command and output directory are set in the Cloudflare dashboard, not in this repo. They should match `npm run build` and `dist/arsen-portfolio-2025/browser`.
- **Previews.** Every pushed branch is deployed to `https://<branch>.krupanjac.pages.dev`, and the Cloudflare bot comments the link on the PR. `wrangler.toml` has no `[env.preview]` section, so previews most likely use the **production** D1 and KV. Treat Dashboard edits on a preview as live edits.
- **Wonder Publish.** Publishes a static build of a worktree. It has no Pages Functions, so `/api` is missing there too.
- **D1 schema changes.**
  1. Add `migrations/000N_<name>.sql`.
  2. Apply it locally with `--local` and test.
  3. **The owner** applies it to production with `npx wrangler d1 migrations apply portfolio --remote`, before merging code that depends on it.

  Agents never run `--remote` commands.

## Secrets and accounts (owner tasks)

| What | Where | Notes |
|---|---|---|
| `JWT_SECRET` | Cloudflare dashboard, Pages project, Settings, Variables and Secrets (production and preview) | Any long random string. Rotating it logs every session out |
| `TURNSTILE_SECRET` | Same place. The value comes from the Turnstile widget settings | Must belong to the same widget as the site key in `login.component.ts` |
| `IMAGEKIT_PRIVATE_KEY` | Same place. The value comes from the ImageKit dashboard (Developer, API keys) | Only `/api/imagekit-auth` uses it |
| Admin users | KV namespace `USERS`, key `user:<name>` holding a bcrypt hash | Create or rotate with `node scripts/gen.js '<password>'`, then `npx wrangler kv key put "user:<name>" '<hash>' --binding USERS --remote` |

To make a strong secret: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

## Content operations

- **Projects and Experience.** Open the person icon in the nav, sign in, then:
  1. Choose **New**.
  2. Pick a category and fill in title, markdown description, tags (comma-separated) and date.
  3. Upload images; Projects only, since Experience entries drop them.
  4. **Save**.

  Changes go live immediately, but they're fetched in the browser, so they don't appear in the prerendered HTML (ROADMAP SEO-1).
- **Resume.** Replace `public/Arsen_Djurdjev_Resume.pdf` and keep the filename: `/resume`, `/cv`, the modal, the sitemap and `robots.txt` all point at it. Then bump `<lastmod>` in `public/sitemap.xml`.
- **Tech stack wheel.** For each item:
  1. Edit the groups in `tech-stack-wheel.component.ts`.
  2. Add `HOME.STACK.ITEMS.<KEY>` to both catalogs.
  3. Add an icon case to the template.
- **Copy.** Edit `public/i18n/*.json`; see the `i18n-copy` playbook (`.claude/skills/i18n-copy/SKILL.md`).

## Git and PR workflow

- Branch from `master`.
- Write commits in [Conventional Commits](https://www.conventionalcommits.org/) style: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:` or `test:`, with an optional scope (`feat(hero): …`). Cite ROADMAP IDs where relevant.
- Open a PR and fill in the template. CI (`npm run verify`) must be green.
- Check the Cloudflare preview at a phone width and at desktop, in both themes and both languages.
- When a ROADMAP item ships, mark it ✅ with the PR number in `docs/ROADMAP.md`.

## Troubleshooting

- **Karma can't find Chrome:** point `CHROME_BIN` at a Chrome or Chromium binary.
- **The whole file shows as changed on Windows:** the repo stores LF and `core.autocrlf` checks files out as CRLF. Keep each file's existing endings (ROADMAP DX-5 adds `.gitattributes`).
- **`npm ci` warns about `inflight`, `glob` or `rimraf`:** these come from Karma's dependency tree and are harmless.
- **Projects or Experience are empty locally:** expected without the API; see [What works without the API](#what-works-without-the-api).
- **The hero renderer is frozen and the HUD reads "paused · reduced motion":** the system asks for reduced motion. On Windows that's "Animation effects" turned off. Press ▶ in the HUD (remembered on that device), or turn the setting back on.
- **The Preview is stuck on a bare "Error" page:** the dev server answered 500 while it was rebuilding. This happened once while `npm run verify` was building alongside it. That page has no live-reload client, so it never recovers on its own: restart the Preview.
