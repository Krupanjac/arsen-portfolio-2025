# krupanjac.dev

Portfolio of **Arsen Đurđev**, software engineer. Live at **https://krupanjac.dev**.

An Angular 19 single-page site, prerendered and served by Cloudflare Pages. A small Pages Functions API (D1 + KV) sits behind a private Dashboard used to edit the Projects and Experience entries. It comes in English and Serbian, with dark and light themes, and has a playable star-field background.

## Quick start

```bash
npm ci
npm start          # http://localhost:4200
npm run verify     # i18n check, unit tests, production build: what CI runs
```

Projects and Experience come from the API, which `ng serve` doesn't run. [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) explains the full-stack setup.

## Scripts

| Script | What it does |
|---|---|
| `npm start` | Dev server on port 4200 |
| `npm run build` | Production build and prerender into `dist/arsen-portfolio-2025/browser` |
| `npm run watch` | Development build in watch mode |
| `npm test` | Karma in watch mode (opens Chrome) |
| `npm run test:ci` | One headless test run |
| `npm run check:i18n` | Checks the `en`/`sr` translation catalogs against each other and against the code |
| `npm run verify` | Everything CI runs |
| `npm run d1:migrate` | `wrangler d1 migrations apply portfolio`; pass `-- --local` or `-- --remote` |
| `npm run serve:ssr:arsen-portfolio-2025` | Serves the SSR build with Node/Express (local only) |

## Documentation

- [AGENTS.md](AGENTS.md): commands, rules and the definition of done, for anyone changing the code, human or AI
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the frontend, the API, the data and the hosting fit together
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): setup, the verify loop, the local full stack, secrets, deploys and content
- [docs/ROADMAP.md](docs/ROADMAP.md): known issues and the phased improvement plan

## Interactive mode

Press **Play** (below the tech-stack wheel) to hide the page and play with the star field.

| Input | Effect |
|---|---|
| `D` | Toggle gravity-drawing mode |
| `Shift` + click | Start or stop laying gravity points (drawing mode) |
| `S` | Add 20 stars (drawing mode) |
| `C` | Clear gravity fields |
| Click | Particle burst |
| ✕ (top right) | Leave play mode |

Stars are drawn toward gravity points and repel each other at long range. Gravity fields fade visually but keep pulling.

## Stack

Angular 19 · TypeScript 5.7 · Tailwind CSS 4 · ngx-translate · marked + DOMPurify · Cloudflare Pages + Functions · D1 · KV · ImageKit · Turnstile
