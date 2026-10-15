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

The Wonder run profile for this repo is: setup `npm ci`, run `npm start`, port `4200`.

### What works without the API

`ng serve` serves only the Angular app. Everything renders except the parts that need `/api`:

- **Projects and Experience** show their empty states, because `GET /api/posts` returns 404.
- **The Dashboard login** fails, because `/api/login` isn't there. The Turnstile widget also refuses `localhost` with the production site key.

To see those, use a [branch preview](#deploying), or run the [full stack locally](#full-stack-locally).

## The verify loop

| Command | Runs | Catches |
|---|---|---|
| `npm run check:i18n` | `scripts/check-i18n.mjs` | Locale keys missing from one side, empty values, `{{param}}` mismatches, keys used in `src/` but not defined. Warns about unused keys |
| `npm run test:ci` | Karma + Jasmine, headless Chrome, single run | Broken components and services |
| `npm run build` | Production build + prerender of every route in Node | Template type errors (`strictTemplates`), budget errors (>1 MB initial), browser APIs used on the server |
| `npm run verify` | All three, cheapest first | Everything above. CI runs this on every PR |

Common failures:

| Symptom | Fix |
|---|---|
| A spec fails with `NullInjectorError: No provider for TranslateService` / `HttpClient` | Add `providers: [provideTestDeps()]` (from `src/testing/test-providers.ts`) to `TestBed.configureTestingModule`, or extend that helper |
| The build fails while "Prerendering", with `window`/`document`/`localStorage is not defined` | Guard the code with `isPlatformBrowser(this.platformId)`, or move it to `ngAfterViewInit` behind the guard |
| `check:i18n` says `sr: missing X` | Add the key to `public/i18n/sr.json` in the same place as in `en.json` |
| `check:i18n` says `src/... references X, which en.json does not define` | Add the key to both catalogs, or fix the typo |
| "bundle initial exceeded maximum budget" **warning** | Expected until ROADMAP PERF-1: 733 kB against 500 kB. Only an **error** (over 1 MB) fails the build |

Claude Code also runs the i18n check after every file edit (`.claude/hooks/post-edit.mjs`) and reports failures back to the agent right away.

## Full stack locally

> This isn't scripted yet; ROADMAP DX-3 will make it one command. The steps follow Cloudflare's documented Wrangler CLI. Always pass `--local` explicitly so nothing touches production.

1. **Secrets.** Copy `.dev.vars.example` to `.dev.vars`, which is git-ignored, and fill it in. Locally, use Turnstile's always-pass test secret. The widget's site key is hardcoded to the production key in `login.component.ts:25`, so for local login temporarily swap it for the test key `1x00000000000000000000AA`, and don't commit that (ROADMAP DX-4).
2. **Database schema:**

   ```bash
   npx wrangler d1 migrations apply portfolio --local
   ```

3. **An admin user:**

   ```bash
   node scripts/gen.js 'pick-a-password'          # prints a bcrypt hash
   npx wrangler kv key put "user:admin" '<hash>' --binding USERS --local
   ```

   Keep the hash in single quotes; it contains `$`.

4. **Sample content** (optional):

   ```bash
   npx wrangler d1 execute portfolio --local --command "INSERT INTO posts (title, description, tags, images, category, created_by, created_at) VALUES ('Sample project', 'Built with **Angular**', '[\"angular\"]', '[]', 'project', 'admin', strftime('%s','now'))"
   ```

5. **Build and serve with Functions:**

   ```bash
   npm run build
   npx wrangler pages dev     # uses pages_build_output_dir and the bindings from wrangler.toml
   ```

   Open http://localhost:8788. Rebuild after UI changes (or run `npm run watch` in a second terminal).

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
