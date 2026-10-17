#!/usr/bin/env node
// scripts/dev-full.mjs
// The full stack for local development, as one process tree:
//   api  wrangler pages dev on 127.0.0.1:8788 — Pages Functions with local D1 and KV
//   web  ng serve on :4200, proxying /api to the api (proxy.conf.json)
// The Angular dev server keeps hot reload; the Functions reload on save too.
//
// Both children start through node directly. On Windows, npm/npx run CLIs
// through .cmd batch shims, and an interrupted batch job stops to ask
// "Terminate batch job (Y/N)?", which kept stops from completing.
//
// The first run seeds the local state (scripts/seed-local.mjs): schema, an
// admin login and sample posts. Everything stays in .wrangler/state; nothing
// here touches production.
//
// usage: node scripts/dev-full.mjs        (npm run dev:full)

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const API_PORT = process.env.API_PORT || '8788';
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const NG = join(ROOT, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');

for (const [file, hint] of [[WRANGLER, 'wrangler'], [NG, '@angular/cli']]) {
  if (!existsSync(file)) {
    console.error(`[dev-full] ${hint} is not installed; run npm ci first.`);
    process.exit(1);
  }
}

if (!existsSync(join(ROOT, '.dev.vars')) || !existsSync(join(ROOT, '.wrangler', 'state', 'v3', 'd1'))) {
  console.log('[dev-full] no local state yet: seeding it (scripts/seed-local.mjs)');
  const seed = spawnSync(process.execPath, [join(ROOT, 'scripts', 'seed-local.mjs')], { cwd: ROOT, stdio: 'inherit' });
  if (seed.status !== 0) {
    console.error('[dev-full] seeding failed; starting anyway (Projects and Experience will be empty).');
  }
}

const children = new Map();
let stopping = false;

function start(name, args, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    // No stdin: neither child should wait on keypresses (wrangler's hotkeys,
    // Vite's "press h") when a supervisor owns the process.
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, ...env },
  });
  children.set(name, child);
  child.on('exit', (code, signal) => {
    children.delete(name);
    if (stopping) {
      if (children.size === 0) process.exit(0);
      return;
    }
    console.error(`[dev-full] ${name} exited (${signal ?? code}); stopping the rest.`);
    stop(typeof code === 'number' && code !== 0 ? code : 1);
  });
  return child;
}

function killTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    // child.kill() only ends the node process; workerd and esbuild under it
    // would be orphaned holding their ports. taskkill /T takes the tree.
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) killTree(child);
  // Whatever still hasn't exited gets no say in it.
  setTimeout(() => process.exit(code), 3000).unref();
  if (children.size === 0) process.exit(code);
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(signal, () => stop(0));
}
process.on('exit', () => {
  for (const child of children.values()) killTree(child);
});

start('api', [WRANGLER, 'pages', 'dev', 'public', '--ip', '127.0.0.1', '--port', API_PORT], {
  WRANGLER_SEND_METRICS: 'false',
});
start('web', [NG, 'serve', '--proxy-config', 'proxy.conf.json']);
