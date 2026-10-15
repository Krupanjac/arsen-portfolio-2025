---
name: pages-function
description: Add or change a Cloudflare Pages Function under functions/api (an /api/* endpoint), including auth, D1/KV bindings and secrets. Use for any backend change.
---

# Pages Functions (`/api/*`)

The runtime is Cloudflare Workers (workerd): ES modules and Web APIs only (`fetch`, `crypto.subtle`, `TextEncoder`, `URL`). There are no Node built-ins and no filesystem. Configuration arrives on `env`, not `process.env`.

## Routing

- `functions/api/<name>.js` serves `/api/<name>` **exactly**. Nested paths need folders (`functions/api/posts/[id].js`) or a catch-all (`[[path]].js`). That's why `/api/posts/init` never reaches `posts.js`.
- Prefer method exports: `onRequestGet`, `onRequestPost`, `onRequestPut`, `onRequestDelete`.
- `functions/api/_middleware.js` runs first on every `/api/*` request. It lets through public prefixes, static file extensions and every `GET /api/posts*`; everything else needs a valid `auth` cookie. If your endpoint is public, add it to `publicPrefixes`.

## Template

```js
import { getTokenFromRequest, unauthorizedJSON, jsonOK } from './_auth.js';
import { verifyJWT } from './login.js';

const badRequest = (error) =>
  new Response(JSON.stringify({ error }), { status: 400, headers: { 'Content-Type': 'application/json' } });

export async function onRequestPost({ request, env }) {
  const user = await verifyJWT(getTokenFromRequest(request), env.JWT_SECRET);
  if (!user) return unauthorizedJSON();

  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== 'string' || !body.title.trim()) return badRequest('title is required');

  // env.PORTFOLIO is D1, env.USERS is KV. Always bind parameters; never build SQL with strings.
  const row = await env.PORTFOLIO.prepare('SELECT id FROM posts WHERE title = ?').bind(body.title).first();
  return jsonOK({ exists: !!row });
}
```

## Rules

- **Check auth inside every handler that writes.** Don't rely on the middleware alone.
- **No CORS.** The app calls its own origin, so don't add CORS headers (SEC-1).
- **No leaks.** Send generic error messages to the client, and never `console.log` bodies, tokens or secrets (SEC-3).
- **Parameterized SQL only** (`.bind(...)`).
- **D1 results:**
  - `.first()` returns one row or `null`;
  - `.all()` returns `{ results }`;
  - `.run()` returns `{ meta: { last_row_id, changes } }`.
- **A new secret** goes into `.dev.vars.example`, the secrets table in `docs/DEVELOPMENT.md`, and the configuration table in `docs/ARCHITECTURE.md`. The owner sets the real value in the Cloudflare dashboard.
- **A new binding** goes into `wrangler.toml` and the same docs.

## Verify

1. `npm run verify` covers the frontend side.
2. Run it locally. See `docs/DEVELOPMENT.md`, "Full stack locally": `npx wrangler pages dev`, then `curl -i http://localhost:8788/api/<name>`.
3. Or push the branch and try `https://<branch>.krupanjac.pages.dev`. That preview most likely talks to the **production** D1 and KV.
4. Update the endpoint table in `docs/ARCHITECTURE.md`.
