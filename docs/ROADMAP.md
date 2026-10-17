# Roadmap

The improvement plan for krupanjac.dev: where the project stands, what to do next and in what order, and the evidence behind each item.

**How to use this file**

- Every item has a stable ID (`BUG-1`, `SEC-2`…). Cite it in branch names, commits and PRs, e.g. `fix(styles): register theme tokens with Tailwind (BUG-1)`.
- When an item ships, mark it ✅ with the PR number. Don't delete it; the history is useful.
- New findings get the next free number in their area and go into a phase.
- Severity: **High** means visitors notice it or it risks data/security; **Med** is a real cost; **Low** is hygiene. Effort: **S** is under half a day, **M** is 1–2 days, **L** is longer.

## Snapshot: 2026-10-15, `master` @ `3c1e559`

| Area | State |
|---|---|
| Build | Green in ~40 s. Initial bundle 733 kB raw / 181 kB transferred, over the 500 kB warning budget |
| Unit tests | 15/15 pass. Before the harness PR, 10 of 15 failed because the spec stubs had no providers |
| i18n | 153 keys with full en/sr parity; 50 of them are never used |
| CI | Added by the harness PR; there was none before |
| Lint and format | None |
| Framework | Angular 19.1. Latest is 22.2, and v19 left long-term support in May 2026 |
| Open PRs | #8, the rendering-first rebuild: fast-forwards cleanly, unreviewed |
| Stale branches | `animations/router` (fully merged) and `beta` (superseded by the tech-stack wheel) |

## Phases

### Phase 0: Agent harness ✅ (this PR)

- **Agent instructions:** `AGENTS.md` is the canonical file. `CLAUDE.md` and `GEMINI.md` import it.
- **Docs:** `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, and this file.
- **One verification loop:** `npm run verify` runs the i18n check, the unit tests and the production build with prerender. CI runs the same thing on every PR.
- **Green test suite:** `src/testing/test-providers.ts` plus provider wiring in every spec.
- **Headless test runner:** `karma.conf.js` adds `ChromeHeadlessCI` for CI and agents.
- **i18n checker:** `scripts/check-i18n.mjs` covers parity, empty values, `{{param}}` mismatches, undefined keys (with `file:line`) and unused keys.
- **Claude Code settings:** `.claude/settings.json` holds permissions (the verify loop is allowed; anything with wrangler asks first). The post-edit hook runs the i18n check after every edit.
- **Playbooks:** `.claude/skills/*`, for i18n, sections, content, Functions, and the pre-PR checklist.
- **Repo hygiene:** a PR template, `.dev.vars.example`, and a README that describes this project.

### Phase 1: Land PR #8 safely

PR #8 replaces the 2D star field with a WebGL2 terrain renderer, a frame-time HUD, new fonts and a darker palette. Status of the plan:

1. **Merge the harness first.** PR #9, CI green; waiting on the merge.
2. **Bring the harness into PR #8.** ✅ Done as a merge of the harness branch into `wonder/Sottsass`, so there was no force-push. `README.md` got the new structure with PR #8's Renderer section, and `background.component.spec.ts` was deleted with its component. `package.json` merged cleanly.
3. **Let CI run `npm run verify` on the PR.** ✅ 119 tests: 89 for the engine (scaler, frame timer, loop, colour, uniforms, real-WebGL2 surfaces) and 14 for the HUD, hero, nav and contact. Plus the new shader compile check (DX-11).
4. **Fix the review findings.** ✅ R8-1 to R8-8 below. R8-9 stays open until someone tests on real hardware.

| ID | Finding | Status |
|---|---|---|
| R8-1 | The resolution scaler could only scale down on 60 Hz displays: it compared the rAF interval (~16.7 ms) to an 11.7 ms raise threshold | ✅ GPU-time budget when the timer exists, dropped frames against the measured refresh rate otherwise, with warm-up, hysteresis and backoff; starts at 75 % |
| R8-2 | Parking didn't hold: `setActive()` and the IntersectionObserver wrote the same flag, and the field started running while invisible | ✅ Three separate loop conditions; the field starts parked (`[active]="false"`) |
| R8-3 | `@ViewChild` was read before it resolved, so the GPU name stayed "detecting…" and the field's quality lock did nothing | ✅ Read from the emitting surface; the lock is a `[qualityLock]` input |
| R8-4 | Reduced motion rendered every frame at full resolution and kept the camera, HUD loop and name scramble moving | ✅ Still frames drawn only on change; camera inputs held; HUD redraws on stats; scramble off |
| R8-5 | Both contexts forced the discrete GPU; the HUD redrew while hidden; observers doubled after a context restore | ✅ `powerPreference: 'default'` (opt-in per surface); the HUD stops while hidden; listeners attach once |
| R8-6 | The HUD took focus at opacity 0, some aria-labels were hardcoded English, and the `<h1>` text changed every 2.6 s | ✅ HUD `inert` while hidden; 13 new en/sr keys; stable `sr-only` heading name |
| R8-7 | Scroll listeners inside Angular's zone ran change detection on every scroll | ✅ Nav, hero and tooltip listeners run outside the zone |
| R8-8 | Octaves didn't scale with quality, despite the shader comment | ✅ 5 to 7, plus the warp/crest tap |
| R8-9 | All measurements so far come from SwiftShader | Open: test on a 60 Hz and a 120 Hz display, an integrated-GPU laptop and a mid-range phone, and tune the scaler thresholds |

5. **Merge.** The docs already describe the renderer: the ARCHITECTURE Renderer section and the README Renderer section.
6. **Delete the stale branches** (DX-10).

### Phase 2: Fix what's visibly broken (about 2 days)

All small, independent and low-risk. Check each item against PR #8 first; some will have moved.

| ID | Item | Sev | Effort |
|---|---|---|---|
| BUG-1 | Theme tokens are invisible to Tailwind, so about 50 class usages produce no CSS | High | S–M |
| BUG-3 | Posts are fetched two or three times per page view | Med | S |
| BUG-4 | Hardcoded English bypasses i18n | Med | S |
| BUG-5 | `insertedId` is always `null` | Low | S |
| BUG-6 | Dead `/api/posts/init` path and DDL on every request | Low | S |
| BUG-7 | Markup and dead-code cleanup | Low | S |
| BUG-9 | The mobile menu lists sections in a different order than the page | Low | S |
| BUG-10 | Theme selectors in component stylesheets never match | High | S |
| SEC-1 | CORS reflects any origin, with credentials | Med | S |
| SEC-2 | JWT signature check isn't constant-time | Med | S |
| SEC-3 | Debug logs and leaked DB errors | Med | S |
| PERF-3 | Change detection runs on every animation frame and scroll event | Med | S |
| PERF-5 | ✅ (PR #8) The typing animation ran during server rendering | Med | S |
| A11Y-2 | Text can't be selected; links have no pointer; scrollbars are hidden | Med | S |
| SEO-3 | Broken link-preview metadata and a static `lang` | Med | S |
| DX-3 | Full stack locally in one command | Med | S |
| DX-4 | Turnstile and ImageKit config are hardcoded, so local login can't work | Med | S |
| DX-10 | Delete stale branches | Low | S |

### Phase 3: Modernize the base (3–5 days)

Do the framework work before the larger SEO and performance work in Phase 4, which builds on newer Angular features (stable zoneless, hydration, `@defer`).

| ID | Item | Sev | Effort |
|---|---|---|---|
| PLAT-1 | Angular 19 → 22, one major per PR | High | L |
| PLAT-2 | Dependency hygiene | Low | S |
| DX-2 | ESLint + Prettier, run in a single formatting commit after PR #8 | Med | S |
| DX-5 | `.gitattributes`: normalize to LF | Low | S |
| DX-6 | Tests for Pages Functions | Med | M |
| DX-8 | Pin the Node version | Low | S |
| DX-9 | Naming cleanup and one copy of the schema | Low | S |
| BUG-2 | Decide on routing: delete the vestigial routes, or add a real outlet | Med | S |

### Phase 4: Be found, be fast, be usable (1–2 weeks)

| ID | Item | Sev | Effort |
|---|---|---|---|
| SEO-1 | Projects and Experience are missing from the HTML that crawlers and link previews see | High | M |
| SEO-2 | Nine identical prerendered pages and no canonical URL | Med | S |
| BUG-8 | First paint: light-theme flash, then a full re-render with no hydration | Med | M |
| PERF-1 | The initial bundle is 733 kB; defer the Dashboard and other heavy parts | High | M |
| PERF-2 | Continuous animation cost with no low-power path | Med | M |
| PERF-4 | Load and subset fonts properly | Low | S |
| A11Y-1 | Reduced motion everywhere | High | M |
| A11Y-3 | Accessible dialogs (role, focus trap, focus return) | Med | M |
| A11Y-4 | Screen-reader-safe typing effect and tooltips | Med | S |
| A11Y-5 | One `<h1>` and a proper heading outline | Low | S |
| SEC-4 | Security headers (`public/_headers`), starting with CSP in report-only | Med | M |
| SEC-5 | Validate post input on the server | Low | S |
| SEC-6 | Safe server-side markdown sanitizing (a blocker for SEO-1) | Low | S |
| SEC-7 | Rate-limit the login | Low | S |
| DX-7 | Playwright smoke and visual tests against the branch preview | Med | M |

### Phase 5: Grow (owner decisions)

- **PROD-1:** project detail pages.
- **PROD-2:** decide whether the blog lives.
- **PROD-3:** analytics.
- **PROD-4:** contact form.
- **PROD-5:** CMS quality-of-life.
- **PROD-6:** a "publish" deploy hook.
- **SEO-4:** an AI-crawler policy.
- **PLAT-3:** a cleaned-up design-token system.

---

## Findings catalog

### Bugs

**BUG-1: Theme tokens are invisible to Tailwind.** High · S–M
- **Evidence:**
  - The tokens are declared as CSS variables on `:root` and `:root[data-theme='dark']` (`src/styles.scss:8`, `:31`) instead of in a Tailwind `@theme` block, so Tailwind v4 never generates their utilities.
  - The production CSS contains no `.bg-accent*`, `.ring-accent*`, `.from-surface*`, `.shadow-accent*` or `.bg-danger`.
  - About 50 usages in templates are affected: the tag pills (`bg-accent/80 text-white`) in Projects and Experience, the login submit button (`bg-accent`), Sign out (`bg-danger`), the focus rings (`ring-accent`), the timeline dots, and the card gradients.
- **Effect:** pills and buttons are white text on no background, invisible in the light theme. Focus rings fall back to the current text colour.
- **Fix:**
  1. Declare the light-theme colour tokens inside `@theme { … }` (same `--color-*` names) and keep the `[data-theme='dark']` overrides. Tailwind's utilities reference the variables, so runtime theming keeps working.
  2. Add `--color-danger`. Keep `--color-accent-rgb` outside `@theme`; it isn't a colour.
  3. Once the utilities exist, retire the `!important` helper classes one by one.
- **Done when:** the built CSS contains `.bg-accent` and friends, and pills and buttons look intended in both themes in the Preview. **PR #8 doesn't fix this.** Because it changes how things look, review it on the canvas or in the Preview before merging.

**BUG-2: The router has no outlet.** Med · S
- **Evidence:**
  - `app.routes.ts:16-21` declares `blog`, `admin` (with `authGuard`), `resume` and `cv`, but no template has `<router-outlet>`.
  - After login, `login.component.ts:86` navigates to `/admin`, the guard bounces to `/login`, which doesn't exist, and the wildcard sends the user to `/`.
  - `AdminComponent`, `BlogListComponent`, `authGuard` and `AuthService` never take effect.
- **Fix:** decide which way to go.
  - **(a)** Delete them, remove the post-login navigation, and prerender only `/` (`app.routes.server.ts`).
  - **(b)** Add an outlet and real routes. This is only worth it together with PROD-1.
  - Recommend (a) now and (b) when project pages are built.
- **Done when:** nothing in `src/app` is unreachable, and the prerender list matches the real pages.

**BUG-3: Posts are fetched more than once.** Med · S
- **Evidence:** `projects.component.ts:42` and `experience.component.ts:29` each call `BlogService.list()`, and the Dashboard calls it again.
- **Fix:** cache in `BlogService` (`shareReplay({ bufferSize: 1, refCount: false })`, or a signal store), and invalidate it on create, update and delete.
- **Done when:** one `GET /api/posts` per page view.

**BUG-4: Hardcoded English.** Med · S
- **Evidence:**
  - `experience.component.html:44` reads "No experience experience entries yet." (with a typo).
  - `projects.component.html:36` has "No project posts available yet.", and the card has an "Open" label.
  - `tech-stack-wheel.component.html:26` has the ring hint.
  - The nav's Dashboard has "Signed in as" and "Sign out".
  - `blog-list` and the `alert()` calls in the nav and the admin editor are also English-only.
- **Fix:** move it all into the catalogs. PR #8 rewrites both empty states, so do whatever remains after it.
- **Done when:** switching to SR leaves no English on the public page.

**BUG-5: `insertedId` is always `null`.** Low · S
- **Evidence:** `functions/api/posts.js:92` reads `res.lastInsertRowid`, but D1 returns `res.meta.last_row_id`.

**BUG-6: Dead init path and DDL on every request.** Low · S
- **Evidence:**
  - `posts.js:63-66` handles `/api/posts/init`, which file routing never sends to `posts.js`; `BlogService.init()` and the admin editor's `initDb()` call it anyway.
  - `initializeDatabase()` (`posts.js:5`) queries `sqlite_master` on every request, twice when `onRequest` dispatches to a method handler.
- **Fix:** delete the init path and the inline DDL, rely on `migrations/`, and delete the duplicate `functions/db/init_posts.sql`.

**BUG-7: Markup and dead-code cleanup.** Low · S
- `home.component.html` leaves two `<div>`s unclosed.
- The `MarkdownInlinePipe` import in `projects.component.ts:21` is unused; it's the build's only warning.
- `projects: Project[]` in `projects.component.ts` is unused.
- `prose prose-invert` in `blog-modal.component.html:56` does nothing without `@tailwindcss/typography`.
- `NavComponent.onLogin()` (`nav.component.ts:132`) is dead and bypasses Turnstile.
- `BackgroundComponent.addTextShape()` (`:104`) has been dead since the `T` key was removed.
- `unauthorizedJSON()` ignores the message it's passed (`imagekit-auth.js:11`).

**BUG-8: First paint flashes.** Med · M
- **Evidence:**
  - The prerendered `<html>` has no `data-theme`, so the light tokens paint first and the nav switches to dark once JS boots.
  - `provideClientHydration` isn't configured, so Angular throws away the prerendered DOM and renders again.
  - The loader overlay appears after content is already visible.
- **Fix:**
  1. Add a tiny inline script in `index.html`'s `<head>` that sets `data-theme` from `localStorage` (default dark) before first paint.
  2. Add `provideClientHydration(withEventReplay())`. Directives that write `innerHTML` (typing, hero glitch) need `ngSkipHydration` or a refactor.
  3. Retire the full-page loader once hydration works.

**BUG-9: Mobile menu order.** Low · S · ✅ fixed by PR #8, pinned by a nav spec
- **Evidence:** the mobile menu lists Projects before Experience; the page and the desktop nav list Experience first (`nav.component.html`).
- **Note:** PR #8 builds both menus from one `sections` list, which probably fixes this. Verify after merging.

**BUG-10: Theme selectors in component stylesheets never match.** High · S · ✅ for the hero and the footer in PR #8
- **Evidence:** `:root:not([data-theme='dark']) .stage__scrim` in `hero-render.component.scss` computed to the **dark** gradient in light mode. Emulated encapsulation rewrites the selector and tags the `:root` compound with the component attribute, so it never matches. The hero copy in light mode sat on a darkened column. The footer's light-mode separator had the same problem.
- **Fix:** `:host-context(html:not([data-theme='dark'])) .x` (done for `hero-render` and `footer`). `AGENTS.md` rule 11 now says so.
- **Remaining:** `home.component.scss` still has `:root[data-theme='dark']` rules, but they style classes no template uses any more (`.stack-group`, `.tech-item`, left over from the old tech-stack section). Delete them with BUG-7.

### Security

**SEC-1: CORS reflects any origin with credentials.** Med · S
- **Evidence:**
  - `login.js:100`, `logout.js` and `posts.js:37` echo the request's `Origin` together with `Access-Control-Allow-Credentials: true`.
  - `imagekit-auth.js:73` pairs `*` with credentials.
- **Today:** the `SameSite=Strict` cookie is what stops abuse.
- **Fix:** the app calls its own origin and needs no CORS at all. Delete `corsHeaders`/`onRequestOptions`, or allow-list `https://krupanjac.dev` plus the preview domain.

**SEC-2: JWT verification.** Med · S
- **Evidence:** `login.js:87` compares signatures with `!==`.
- **Fix:**
  - Verify with `crypto.subtle.verify('HMAC', …)`, which is constant-time.
  - Add `iat`.
  - Write down that logout only deletes the cookie; rotating `JWT_SECRET` is how you revoke every session.

**SEC-3: Debug logging and leaked errors.** Med · S
- **Evidence:**
  - `posts.js:132` logs whole PUT bodies, and `posts.js:181` logs every request.
  - The raw D1 `e.message` goes back to clients (`posts.js:95` and others).
- **Fix:** remove the logs, return generic errors, and log the details on the server only.

**SEC-4: No security headers.** Med · M
- **Fix:** add `public/_headers` with:
  - a CSP;
  - `X-Content-Type-Options: nosniff`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `Permissions-Policy`;
  - `frame-ancestors 'none'`.
- **CSP needs:**
  - Turnstile (`challenges.cloudflare.com`);
  - ImageKit (`ik.imagekit.io` for images, `upload.imagekit.io` for uploads);
  - Google Fonts, if PR #8 keeps them;
  - inline styles, which Angular and the tooltip directive use.
- **Rollout:** ship it as `Content-Security-Policy-Report-Only` first and watch the reports.

**SEC-5: Validate post input.** Low · S
- **Gap:** `category` isn't constrained, there are no length limits, and image entries aren't checked to be `https:` URLs.
- **Fix:** validate in `posts.js`. SQLite can't add a `CHECK` constraint after the fact.

**SEC-6: Server-side markdown sanitizing.** Low · S
- **Evidence:** on the server, `markdown.pipe.ts` falls back to a regex strip. It's harmless today because posts never render on the server.
- **Fix:** before SEO-1 starts rendering posts at build time, sanitize when a post is written (in `posts.js`) or use a DOM-based sanitizer on the server.

**SEC-7: Rate-limit the login.** Low · S
- **Gap:** Turnstile stops bots, but not slow manual guessing.
- **Fix:** add a Cloudflare rate-limiting rule for `POST /api/login`.

### SEO

**SEO-1: The real content isn't in the HTML.** High · M
- **Evidence:** the prerendered page ships the empty state ("No project posts available yet.") with zero project or experience entries. Projects and Experience load in the browser only, so crawlers that don't run JS, and every link preview, see an empty portfolio.
- **Options:**
  - **(a)** Fetch the posts at build time during prerender, from the production API, with an absolute URL taken from an env var. Add a Cloudflare Pages deploy hook that the Dashboard calls after saving (PROD-6).
  - **(b)** Run Angular SSR in a Pages Function. Always fresh, but more moving parts.
  - **(c)** A static `<noscript>` summary. The minimum.
- **Recommendation:** (a). Needs SEC-6 first.

**SEO-2: Duplicate pages.** Med · S
- **Evidence:** the seven prerendered HTML files (`/`, `/about`, `/admin`, `/blog`, `/contact`, `/experience`, `/projects`) are byte-identical, and there's no `<link rel="canonical">`.
- **Fix:** after BUG-2, prerender only real pages and add a canonical URL.

**SEO-3: Metadata.** Med · S
- `og:url` has no scheme (`src/index.html:13`), and `og:image` is `favicon.ico` (`:14`). Design a 1200×630 card.
- `<html lang>` stays `en` in Serbian (`:2`). Set it from the language service.
- Add JSON-LD `Person` data: name, url, jobTitle, and `sameAs` links to LinkedIn, GitHub and Instagram.
- The sitemap `lastmod` is from 2025 (`public/sitemap.xml:6`). Update it or drop it.
- The `robots.txt:52` comment claims `/resume` and `/cv` redirect on the client. They're 301s in `_redirects`.

**SEO-4: AI-crawler policy.** Decision
- **Today:** besides the training crawlers, `robots.txt` also blocks the agents that let assistants index or fetch pages for a user (`ChatGPT-User`, `PerplexityBot`, `Claude-Web`). AI assistants therefore can't read or cite the portfolio when someone asks them about Arsen.
- **Option:** keep blocking the training crawlers (`GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`, `Applebot-Extended`, `Bytespider`) and allow the search and user agents (`OAI-SearchBot`, `ChatGPT-User`, `Claude-SearchBot`, `Claude-User`, `Perplexity-User`). Your call.

### Performance

**PERF-1: Initial bundle size.** High · M
- **Evidence:**
  - The initial bundle is 733 kB raw against a 500 kB budget.
  - `AppComponent` imports every section eagerly.
  - `NavComponent` eagerly imports `LoginComponent` and `AdminEditorComponent`, which pull in `marked`, DOMPurify, the ImageKit SDK and forms. Only the owner ever opens that Dashboard.
- **Fix:**
  - Load the Dashboard with `@defer (on interaction)` or a dynamic import.
  - Defer `BlogModalComponent` until it's first opened.
  - Defer the tech-wheel physics until it's in view.
  - Don't `@defer` sections whose text should be indexed: deferred blocks aren't prerendered.
  - Move off `@angular/animations` to CSS.
  - Then tighten the error budget.
- **Done when:** the initial bundle is under 500 kB.

**PERF-2: Continuous animation cost.** Med · M
- **Evidence:**
  - The star field checks every pair of stars for connections on every frame, for the whole visit (`background.component.ts:570-578`).
  - The hero glitch rewrites `innerHTML` every second (`hero.component.ts:33`).
  - The tech-wheel physics runs on rAF.
  - None of these has a low-power or reduced-motion path.
- **Note:** PR #8 replaces the canvas with a renderer that parks itself (see R8-2, R8-5).
- **Fix:** pause whatever is off-screen, cap DPR and particle counts on small or low-power devices, and honour A11Y-1.

**PERF-3: Change-detection storms.** Med · S · mostly ✅ in PR #8 (the star field is gone; nav, hero and tooltip listeners run outside the zone). Still open: the one-line event coalescing
- **Evidence:**
  - The star field's rAF loop runs inside Angular's zone (no `runOutsideAngular`; only the tech wheel uses it), so app-wide change detection runs on every frame.
  - `appTooltip` listens to `window:scroll` and `window:resize` on every instance (`tooltip.directive.ts:89-90`), 16–25 of them at runtime.
  - The nav, hero and footer scroll handlers also run in the zone.
- **Fix:**
  - `provideZoneChangeDetection({ eventCoalescing: true, runCoalescing: true })`, a one-line change.
  - Move animation loops outside the zone.
  - Attach the tooltip scroll listener only while its bubble is visible.
  - Later, go zoneless (PLAT-1).

**PERF-4: Fonts.** Low · S
- **Evidence:** on master, `'Open Sans'` was declared but never loaded. PR #8 loads three families (Space Grotesk, IBM Plex Sans, JetBrains Mono) through a Google Fonts stylesheet: a third-party request on the critical path, and an origin the CSP (SEC-4) has to allow.
- **Fix:** self-host them with `font-display: swap`, preload the display face, and subset to Latin plus Latin Extended (Serbian needs đ č ć š ž).

**PERF-5: The typing animation ran during server rendering.** Med · S · ✅ PR #8
- **Evidence:** `TerminalTypingDirective` had no platform guard. Server renders wait for pending timers, and each of the page's ~30 typed labels started a per-character `setTimeout` chain once the catalog loaded. Every dev-server page load and every prerendered route was held open for seconds; the first dev-server response took 4.2 s.
- **Fix:** the directive does nothing outside the browser and drops a late translation on destroy. With the same warm cache, the production build (which prerenders) went from 27.3 s to 19.6 s, and the prerendered copy is unchanged.

### Accessibility

**A11Y-1: Reduced motion.** High · M · renderer, HUD, hero and nav ✅ in PR #8; the typing effect, footer scroll and `@angular/animations` still ignore it
- **Evidence:** on `master`, only `experience.component.scss` checks `prefers-reduced-motion`. The canvas, glitch, typing, wheel physics and scroll animations all ignore it. PR #8 adds a global CSS rule, but its renderer logic is inverted (R8-4).
- **Fix:** one `MotionService` (a signal over `matchMedia`) consumed by every animated piece.

**A11Y-2: Global interaction blockers.** Med · S
- **Evidence:**
  - `user-select: none` on `html, body` (`styles.scss:66`) stops anyone from selecting or copying text, the email address included.
  - `a { cursor: default }` (`:93`) hides that links are links.
  - Scrollbars are hidden everywhere (`:189`).
- **Fix:** remove all three globally, and use `select-none` only on decorative elements.

**A11Y-3: Dialogs.** Med · M
- **Evidence:** the Dashboard, resume viewer and project viewer have no `role="dialog"` or `aria-modal`, no focus trap, and don't return focus when they close. There are zero such attributes in the templates.
- **Fix:** use `@angular/cdk/dialog`, or one shared dialog primitive.

**A11Y-4: Typing effect and tooltips.** Med · S
- **Evidence:**
  - `appTerminalTyping` rewrites `innerHTML` one character at a time, so screen readers can announce half-typed strings.
  - `appTooltip` sets an empty `aria-describedby`, so screen readers never hear the tooltip. It also adds `tabindex="0"` to any host that lacks one.
- **Fix:**
  - Typing: put the final text in an `sr-only` span or `aria-label`, and animate an `aria-hidden` copy.
  - Tooltips: link the bubble through `aria-describedby`.

**A11Y-5: Headings.** Low · S
- **Evidence:** the prerendered page has five `<h1>`s; the hero alone has three.
- **Fix:** one `<h1>` for the name, and an `<h2>` per section.

### Developer experience

**DX-1: Agent harness.** ✅ (this PR)

**DX-2: Lint and format.** Med · S
- **Fix:**
  - Add angular-eslint and Prettier after PR #8 lands.
  - Format everything in one commit and list that commit in `.git-blame-ignore-revs`.
  - Add `lint` to `npm run verify`.

**DX-3: Full stack locally in one command.** Med · S · ✅ PR #8 (`npm run dev:full`, `npm run seed:local`, Wonder run profile)
- **Gap:** `ng serve` doesn't serve `/api`, so the Preview never shows real Projects/Experience and login can't be tested.
- **Fix:**
  - Add `wrangler` as a pinned devDependency.
  - Add a `proxy.conf.json` that sends `/api` to `http://localhost:8788`.
  - Add a `dev:api` script (`wrangler pages dev`) and a seed SQL file (`scripts/seed-local.sql`).
  - Update the Wonder run profile.

**DX-4: Environment config.** Med · S · Turnstile part ✅ PR #8 (test key on localhost); ImageKit config still hardcoded
- **Evidence:** the Turnstile site key (`login.component.ts:25`) and the ImageKit public key and endpoint (`imagekit.service.ts:14-15`) are hardcoded.
- **Fix:** move them into typed environment config, and use Turnstile's test site key (`1x00000000000000000000AA`) on localhost so local login works.

**DX-5: Line endings.** Low · S
- **Fix:** add `.gitattributes` with `* text=auto eol=lf`. The index is already LF; this stops CRLF churn from Windows agents.

**DX-6: Tests for Pages Functions.** Med · M
- **Fix:** Vitest with `@cloudflare/vitest-pool-workers`, which runs tests in workerd with D1 and KV. Cover:
  - `signJWT`/`verifyJWT` (expiry, tampering);
  - middleware routing;
  - post validation;
  - the auth requirement on every write.

**DX-7: Browser smoke and visual tests.** Med · M
- **Fix:** Playwright. Check that the page loads with no console errors, the theme and language toggles work, the resume modal opens, and play mode toggles. Take screenshots at 375 px and 1280 px in both themes. Run it in CI against the Cloudflare branch preview.

**DX-8: Pin Node.** Low · S
- **Fix:** add `.node-version` (`22`) and `engines`.
- **Caution:** Cloudflare Pages reads `.node-version` too, so check the Pages build image before you pin.

**DX-9: Naming and duplication.**
- Rename:
  - `WorkComponent` → `ExperienceComponent`;
  - `BlogPost`/`BlogService` → `Post`/`PostsService`;
  - the `#resume` section (it holds the Play button) → `#play`.
- Keep a single copy of the posts schema (see BUG-6).

**DX-11: Shader check, render and bench.** ✅ PR #8
- `npm run check:shaders` (part of `verify`) compiles every shader in headless WebGL2 and reports errors at the `.frag.ts` line.
- `render:shaders` writes PNG frames using the site's palette.
- `bench:shaders` compares shader versions.
- **Open:** once a CI log shows "shader check passed", set `SHADER_CHECK_REQUIRE_WEBGL: '1'` on the CI verify step so a missing WebGL2 can't skip silently.

**DX-12: Clean stops for Wonder's run profile.** ✅ PR #8
- **Problem:** `npm start` on Windows runs npm, then `cmd.exe` with the `ng.cmd` batch shim, then node. A stop left `cmd.exe` waiting on "Terminate batch job (Y/N)?".
- **Fix:** the profile runs `node node_modules/@angular/cli/bin/ng.js serve`.

**DX-10: Stale branches.** Low · S
- **Fix:** delete `origin/animations/router` (fully merged) and `origin/beta` (one abandoned commit, superseded). This is an owner task.

### Platform

**PLAT-1: Upgrade Angular 19 → 22.** High · L
- **Why:** v19 left long-term support in May 2026.
- **How:**
  - Run `ng update @angular/core@20 @angular/cli@20`, then 21, then 22. One major per PR, with `npm run verify` and a Preview check after each.
  - Along the way: migrate to the built-in control flow (`ng g @angular/core:control-flow`) and to `inject()`, and evaluate zoneless change detection and Vitest (the default test runner for new projects since v21; the Karma config here is small).
  - Bring along ngx-translate 18, Tailwind 4.3, marked 18 and DOMPurify 3.4, each in a separate commit.
- **When:** after PR #8.

**PLAT-2: Dependency hygiene.** Low · S
- Remove `bcrypt`: it's a native module and unused (only `bcryptjs` is imported).
- Align `@types/node` (currently ^18) with the Node version.
- Note that `express` and `bcryptjs` are server-only.
- `imagekit-javascript` (4.0.1) has been superseded by `@imagekit/javascript` (5.x).
- Drop `@angular/animations` once animations move to CSS.

**PLAT-3: Design tokens.** Low · M
- **Fix:** after BUG-1, move the helper classes into `@theme`/`@utility`, delete the dark-mode remaps of `text-gray-*` and `border-black*`, and document the token set on the Wonder canvas or in a short doc.

### Product ideas (owner decisions)

- **PROD-1: Project detail pages.** `/projects/:slug`, prerendered from D1, shareable and indexable. Needs a `slug` column, BUG-2 option (b), and SEO-1.
- **PROD-2: Blog.** The route exists and renders nothing. Either build it on the posts table (`category = 'post'`) or delete it.
- **PROD-3: Analytics.** Cloudflare Web Analytics: no cookies, no banner. It would show which projects actually get opened.
- **PROD-4: Contact form.** A Pages Function plus Turnstile and an email provider. Optional, since the mailto link works.
- **PROD-5: CMS quality-of-life.**
  - draft/published flag;
  - manual ordering and pinning;
  - reordering images;
  - per-image alt text (also an A11Y win).
- **PROD-6: Publish button.** Calls a Cloudflare Pages deploy hook. Pairs with SEO-1 option (a).
