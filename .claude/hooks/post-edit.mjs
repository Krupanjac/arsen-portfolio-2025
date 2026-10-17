#!/usr/bin/env node
// PostToolUse hook (see .claude/settings.json): after Claude edits a file, run the fast
// checks that apply to it. Exit code 2 sends stderr back to Claude so it can fix the problem
// in the same turn; exit 0 stays silent. Keep everything here well under a second.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;

let file = '';
try {
  file = (JSON.parse(raw).tool_input?.file_path ?? '').replace(/\\/g, '/');
} catch {
  process.exit(0); // not our payload shape; never block on hook plumbing
}

// Translation catalogs, templates and component code can all break i18n.
if (!/\/(public\/i18n\/[^/]+\.json|src\/.+\.(html|ts))$/.test(file) || file.endsWith('.spec.ts')) {
  process.exit(0);
}

const script = fileURLToPath(new URL('../../scripts/check-i18n.mjs', import.meta.url));
const result = spawnSync(process.execPath, [script, '--quiet'], { encoding: 'utf8' });

if (result.status !== 0) {
  process.stderr.write(
    `i18n check failed after editing ${file}:\n${result.stdout}${result.stderr}` +
      'Every key must exist in public/i18n/en.json and sr.json with matching {{params}}.\n',
  );
  process.exit(2);
}
