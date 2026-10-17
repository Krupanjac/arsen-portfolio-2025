# krupanjac.dev

Portfolio of **Arsen Đurđev**, software engineer. Live at **https://krupanjac.dev**.

An Angular 19 single-page site, prerendered and served by Cloudflare Pages. The hero is a WebGL2 raymarched terrain with a live frame-time HUD. A small Pages Functions API (D1 + KV) sits behind a private Dashboard used to edit the Projects and Experience entries. It comes in English and Serbian, with dark and light themes.

## Quick start

```bash
npm ci
npm start          # http://localhost:4200
npm run verify     # i18n check, unit tests, production build: what CI runs
```

Projects and Experience come from the API, which plain `ng serve` doesn't run. `npm run dev:full` runs both, with local data; see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#full-stack-locally).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev:full` | The full stack: site on port 4200, with `/api` served by `wrangler pages dev` from local D1/KV |
| `npm run seed:local` | Resets the local D1/KV and prints a local admin login |
| `npm start` / `npm run dev` | UI-only dev server on port 4200 |
| `npm run build` | Production build and prerender into `dist/arsen-portfolio-2025/browser` |
| `npm run watch` | Development build in watch mode |
| `npm test` | Karma in watch mode (opens Chrome) |
| `npm run test:ci` | One headless test run |
| `npm run check:i18n` | Checks the `en`/`sr` translation catalogs against each other and against the code |
| `npm run check:shaders` | Compiles every shader in headless WebGL2 |
| `npm run render:shaders` / `bench:shaders` | Renders a frame of each shader to `tmp/shader-renders/`, or compares shader versions' cost |
| `npm run verify` | Everything CI runs |
| `npm run d1:migrate` | `wrangler d1 migrations apply portfolio`; pass `-- --local` or `-- --remote` |
| `npm run serve:ssr:arsen-portfolio-2025` | Serves the SSR build with Node/Express (local only) |

## Documentation

- [AGENTS.md](AGENTS.md): commands, rules and the definition of done, for anyone changing the code, human or AI
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the frontend, the renderer, the API, the data and the hosting fit together
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): setup, the verify loop, the local full stack, secrets, deploys and content
- [docs/ROADMAP.md](docs/ROADMAP.md): known issues and the phased improvement plan

## Renderer

The hero is a WebGL2 raymarched terrain (`src/app/gfx/`). Its live frame-time HUD reads from the same timer that drives the dynamic resolution scaling. Below the hero, a cheaper contour-field shader runs behind the content sections, and the terrain is parked once it scrolls out of view.

### Fullscreen mode

The **Fullscreen renderer** control under the tech stack hides the page and leaves only the renderer and HUD.

| Input | Effect |
|---|---|
| Pointer | Look around |
| `1` / `2` / `3` | Pin the internal resolution at 50 / 75 / 100 % |
| `A` | Hand resolution back to the dynamic scaler |
| Click the HUD readout | Expand GPU time, p95 and fill rate |
| `Esc` | Leave fullscreen |

### Structure

- `gfx/gl-context.ts`: context acquisition and capability probe
- `gfx/shader.ts`: compile and link, with the failing source line annotated
- `gfx/frame-timer.ts`: CPU time, GPU time via `EXT_disjoint_timer_query_webgl2`, p95 over a ring buffer
- `gfx/resolution-scaler.ts`: dynamic resolution, driven by GPU time when the timer query exists and by dropped frames against the measured refresh rate otherwise
- `gfx/render-loop.ts`: rAF driver that runs only while the owner, the IntersectionObserver and page visibility all allow it
- `gfx/shader-surface.ts`: a full-canvas fragment pass with all of the above wired in
- `gfx/shaders/`: `common.glsl.ts` (noise, fBm, ACES), `hero-terrain.frag.ts`, `contour-field.frag.ts`

The `hero-terrain.frag.ts` header documents the cost controls.

## Stack

Angular 19 · TypeScript 5.7 · WebGL2 · Tailwind CSS 4 · ngx-translate · marked + DOMPurify · Cloudflare Pages + Functions · D1 · KV · ImageKit · Turnstile
