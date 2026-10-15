#!/usr/bin/env node
// scripts/check-i18n.mjs
// Checks the ngx-translate catalogs in public/i18n/ against each other and against src/.
//
// Errors (exit 1):
//   - a key exists in one locale but not another
//   - a value is empty or not a string
//   - {{params}} differ between locales for the same key
//   - src/ references a key that the base locale does not define
// Warnings:
//   - keys defined but never referenced in src/ (keys under DYNAMIC_PREFIXES are exempt)
//
// Usage: node scripts/check-i18n.mjs [--strict] [--quiet]
//   --strict  treat warnings as errors
//   --quiet   print nothing when everything passes

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const I18N_DIR = join(ROOT, 'public', 'i18n');
const SRC_DIR = join(ROOT, 'src');
const BASE_LOCALE = 'en';

// Keys assembled at runtime (e.g. 'HOME.STACK.ITEMS.' + item.key) can't be found by a static scan.
// Anything under these prefixes is exempt from the unused-key warning.
const DYNAMIC_PREFIXES = ['HOME.STACK.ITEMS.'];

// A quoted literal shaped like a translation key: 'NAV.START', "TOOLTIP.LINKEDIN", `HELP.TITLE`.
const KEY_LITERAL = /(['"`])([A-Z][A-Z0-9_]*(?:\.[A-Z0-9_]+)+)\1/g;
const PARAM = /\{\{\s*([\w.]+)\s*\}\}/g;

const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const quiet = args.has('--quiet');

const errors = [];
const warnings = [];

function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix + k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, key + '.', out);
    else out.set(key, v);
  }
  return out;
}

function params(value) {
  return [...String(value).matchAll(PARAM)].map((m) => m[1]).sort().join(',');
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, files);
    else if (['.ts', '.html'].includes(extname(entry.name)) && !entry.name.endsWith('.spec.ts')) files.push(p);
  }
  return files;
}

// 1. Load every locale.
const locales = new Map();
for (const file of readdirSync(I18N_DIR).filter((f) => f.endsWith('.json')).sort()) {
  const name = file.replace(/\.json$/, '');
  try {
    locales.set(name, flatten(JSON.parse(readFileSync(join(I18N_DIR, file), 'utf8'))));
  } catch (e) {
    errors.push(`public/i18n/${file} is not valid JSON: ${e.message}`);
  }
}
const base = locales.get(BASE_LOCALE);
if (!base) {
  errors.push(`base locale public/i18n/${BASE_LOCALE}.json is missing or invalid`);
} else {
  // 2. Parity, empty values and {{params}} across locales.
  for (const [name, entries] of locales) {
    for (const [key, value] of entries) {
      if (typeof value !== 'string' || value.trim() === '') {
        errors.push(`${name}: ${key} is empty or not a string`);
      }
      if (name !== BASE_LOCALE && !base.has(key)) {
        errors.push(`${name}: ${key} is not defined in ${BASE_LOCALE} (stale or misspelled key?)`);
      }
    }
    if (name === BASE_LOCALE) continue;
    for (const [key, value] of base) {
      if (!entries.has(key)) {
        errors.push(`${name}: missing ${key} (${BASE_LOCALE}: ${JSON.stringify(value)})`);
      } else if (params(entries.get(key)) !== params(value)) {
        errors.push(`${name}: ${key} uses params {${params(entries.get(key))}} but ${BASE_LOCALE} uses {${params(value)}}`);
      }
    }
  }

  // 3. Keys referenced in src/ must exist; defined keys should be referenced.
  const parents = new Set();
  for (const key of base.keys()) {
    const parts = key.split('.');
    for (let i = 1; i < parts.length; i++) parents.add(parts.slice(0, i).join('.'));
  }
  const used = new Set();
  for (const file of walk(SRC_DIR)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(KEY_LITERAL)) {
      const key = m[2];
      used.add(key);
      if (!base.has(key)) {
        const line = text.slice(0, m.index).split('\n').length;
        const where = `${relative(ROOT, file).replace(/\\/g, '/')}:${line}`;
        errors.push(parents.has(key)
          ? `${where} references ${key}, which is a group, not a string`
          : `${where} references ${key}, which ${BASE_LOCALE}.json does not define`);
      }
    }
  }
  const unused = [...base.keys()].filter((k) => !used.has(k) && !DYNAMIC_PREFIXES.some((p) => k.startsWith(p)));
  if (unused.length) {
    warnings.push(`${unused.length} key(s) are never referenced in src/: ${unused.join(', ')}`);
  }

  if (!quiet || errors.length || (strict && warnings.length)) {
    console.log(`i18n: ${locales.size} locales (${[...locales.keys()].join(', ')}), ${base.size} keys, ${used.size} referenced in src/`);
  }
}

for (const e of errors) console.error(`  ✖ ${e}`);
if (strict) for (const w of warnings) console.error(`  ✖ ${w}`);
else if (!quiet) for (const w of warnings) console.log(`  ⚠ ${w}`);

const failed = errors.length > 0 || (strict && warnings.length > 0);
if (failed) {
  console.error(`i18n check failed: ${errors.length} error(s)${strict ? `, ${warnings.length} warning(s)` : ''}.`);
  process.exit(1);
}
if (!quiet) console.log('i18n check passed.');
