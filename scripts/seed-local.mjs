#!/usr/bin/env node
// scripts/seed-local.mjs
// Seeds the LOCAL Cloudflare state that `wrangler pages dev` uses (.wrangler/state):
//   1. .dev.vars, if missing: a random JWT_SECRET and Turnstile's always-pass test secret
//   2. migrations/ applied to the local D1 database
//   3. an admin login in the local USERS KV namespace (password printed at the end)
//   4. Projects/Experience posts, if the local table is empty: by default the live
//      site's public GET /api/posts, so local pages look like production
// Every wrangler call passes --local. Nothing here writes to production.
//
// usage: node scripts/seed-local.mjs [--user admin] [--password <pw>]
//                                    [--posts <file.json|url>] [--force]
//   --force  replace the local posts even when the table already has rows

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const DEFAULT_POSTS = 'https://krupanjac.dev/api/posts';
// Turnstile's documented test secret: siteverify always succeeds with it.
const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const user = flag('user', 'admin');
const password = flag('password', randomBytes(9).toString('base64url'));
const postsSource = flag('posts', DEFAULT_POSTS);
const force = args.includes('--force');

const toml = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8');
const database = /database_name\s*=\s*"([^"]+)"/.exec(toml)?.[1] ?? 'portfolio';
const kvId = /\[\[kv_namespaces\]\][^[]*?id\s*=\s*"([^"]+)"/.exec(toml)?.[1];
if (!kvId) fail('no [[kv_namespaces]] id in wrangler.toml');

function fail(message) {
  console.error(`seed-local: ${message}`);
  process.exit(1);
}

function wrangler(...wranglerArgs) {
  if (!wranglerArgs.includes('--local')) fail(`refusing a non-local wrangler call: ${wranglerArgs.join(' ')}`);
  const result = spawnSync(process.execPath, [WRANGLER, ...wranglerArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    // CI=1 answers wrangler's confirmation prompts with their defaults.
    env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' },
  });
  if (result.status !== 0) {
    fail(`wrangler ${wranglerArgs.slice(0, 3).join(' ')} failed:\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

const sql = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const int = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? String(Math.trunc(Number(v))) : 'NULL');

async function loadPosts(source) {
  try {
    const raw = /^https?:\/\//.test(source)
      ? await (await fetch(source, { signal: AbortSignal.timeout(15000) })).text()
      : readFileSync(source, 'utf8');
    const posts = JSON.parse(raw);
    if (!Array.isArray(posts)) throw new Error('not a JSON array');
    return { posts, from: source };
  } catch (e) {
    console.warn(`  could not load posts from ${source} (${e.message}); using two built-in samples`);
    const now = Math.floor(Date.now() / 1000);
    return {
      from: 'built-in samples',
      posts: [
        { title: 'Sample project', description: 'Seeded by **scripts/seed-local.mjs**.', tags: ['angular', 'webgl'], images: [], category: 'project', created_at: now },
        { title: 'Sample role', description: 'A local experience entry.', tags: ['engineering'], images: [], category: 'experience', created_at: now - 86400 * 400 },
      ],
    };
  }
}

// 1. .dev.vars
const devVars = join(ROOT, '.dev.vars');
if (!existsSync(devVars)) {
  writeFileSync(devVars, [
    '# Local secrets for wrangler pages dev (git-ignored). See .dev.vars.example.',
    `JWT_SECRET=${randomBytes(48).toString('base64url')}`,
    `TURNSTILE_SECRET=${TURNSTILE_TEST_SECRET}`,
    'IMAGEKIT_PRIVATE_KEY=',
    '',
  ].join('\n'));
  console.log('✔ wrote .dev.vars (random JWT_SECRET, Turnstile test secret, no ImageKit key)');
} else {
  console.log('• .dev.vars already exists; left as is');
}

// 2. schema
wrangler('d1', 'migrations', 'apply', database, '--local');
console.log(`✔ migrations applied to the local D1 database "${database}"`);

// 3. admin login
const hash = bcrypt.hashSync(password, 10);
wrangler('kv', 'key', 'put', `user:${user}`, hash, '--namespace-id', kvId, '--local');
console.log(`✔ local admin "${user}" written to KV`);

// 4. posts
const countOut = wrangler('d1', 'execute', database, '--local', '--json', '--command', 'SELECT COUNT(*) AS n FROM posts');
const existing = Number(JSON.parse(countOut)?.[0]?.results?.[0]?.n ?? 0);
if (existing > 0 && !force) {
  console.log(`• ${existing} post(s) already in the local database; kept (pass --force to replace)`);
} else {
  const { posts, from } = await loadPosts(postsSource);
  const lines = ['DELETE FROM posts;'];
  for (const p of posts) {
    const id = Number.isInteger(p.id) ? p.id : null;
    lines.push(
      'INSERT INTO posts (id, title, description, tags, images, category, created_by, updated_by, created_at, updated_at) VALUES (' +
        [
          int(id), sql(p.title ?? 'Untitled'), sql(p.description ?? null),
          sql(JSON.stringify(p.tags ?? [])), sql(JSON.stringify(p.images ?? [])),
          sql(p.category ?? null), sql(p.created_by ?? user), sql(p.updated_by ?? null),
          int(p.created_at), int(p.updated_at),
        ].join(', ') +
        ');',
    );
  }
  const dir = mkdtempSync(join(tmpdir(), 'seed-local-'));
  const file = join(dir, 'posts.sql');
  writeFileSync(file, lines.join('\n') + '\n');
  try {
    wrangler('d1', 'execute', database, '--local', '--file', file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`✔ ${posts.length} post(s) loaded from ${from}`);
}

console.log(`\nLocal admin login: ${user} / ${password}\n(Dashboard: the person icon in the nav. Local only; re-run this script to reset it.)`);
