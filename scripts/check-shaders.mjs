#!/usr/bin/env node
// scripts/check-shaders.mjs
// Compiles every fragment shader in src/app/gfx/shaders/*.frag.ts in headless Chrome, the way the
// app does, and on request renders or times them. Chrome gets WebGL2 from SwiftShader, its
// built-in CPU rasteriser, so no GPU is needed. The in-page half is check-shaders.page.mjs.
//
//   npm run check:shaders    compile + link every shader; on an error print the info log and the
//                            offending lines of the .ts file, and exit 1
//   npm run render:shaders   render one frame of each to tmp/shader-renders/<name>.<theme>.png
//   npm run bench:shaders    time 30 frames of each; report median and p90 ms per frame
//
// Usage: node scripts/check-shaders.mjs [--render | --bench] [options]
//   --only <name>           just these shaders: file stem or export name (repeatable, or a,b)
//   --shaders <dir>         where the *.frag.ts modules are (default src/app/gfx/shaders). Repeat it
//                           to compare versions, e.g. an old copy in tmp/. A common.glsl.ts in the
//                           directory is used with its shaders, else the app's.
//   --require-webgl         exit 1 instead of skipping when Chrome or WebGL2 is unavailable
//                           (same as SHADER_CHECK_REQUIRE_WEBGL=1)
// With --render or --bench:
//   --size <w>x<h>          frame size (default 960x540)
//   --time <s>              uTime (default 12); --bench adds 1/60 s per frame
//   --quality <0..1>        uQuality (default 1)
//   --theme <dark|light|both>  uTheme, uSky and uAccent as the site sets them (default dark)
//   --accent <#rrggbb>      accent colour instead of the theme's --color-accent
//   --uniform <name>=<v,…>  set any uniform, e.g. --uniform uMouse=0.4,-0.2 (repeatable)
//   --out <dir>             where --render writes its PNGs (default tmp/shader-renders)
//   --frames <n>            frames timed per shader by --bench (default 30)
// Debugging: --verbose, --timeout <s>, --chrome-flag=<flag> (repeatable, appended to Chrome's flags)
//
// Chrome is CHROME_BIN, else the first install found in the usual places. SwiftShader renders what
// a GPU would, to within rounding; its timings only mean something relative to each other.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, delimiter, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGE = join(ROOT, 'scripts', 'check-shaders.page.mjs');
const APP_SHADERS = join(ROOT, 'src', 'app', 'gfx', 'shaders');
const APP_COMMON = join(APP_SHADERS, 'common.glsl.ts');
// Where the shared pieces of an assembled shader are defined, to map log lines back to files.
const PART_FILES = {
  HEADER: join(ROOT, 'src', 'app', 'gfx', 'shader-surface.ts'),
  FULLSCREEN_VERTEX_SHADER: join(ROOT, 'src', 'app', 'gfx', 'fullscreen-pass.ts'),
};
const RESULT = /<script[^>]*\bid="shader-check-result"[^>]*>([\s\S]*?)<\/script>/;
const BENCH_WARMUP = 2;

const started = performance.now();
const say = (line = '') => console.log(line);
const shout = (line) => console.error(line);
const display = (p) => {
  const rel = relative(process.cwd(), p);
  return (rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : p).replace(/\\/g, '/');
};
const seconds = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

let opts;
try {
  opts = parseOptions(process.argv.slice(2));
} catch (err) {
  shout(`check-shaders: ${err.message}\nRun with --help for usage.`);
  process.exit(2);
}
if (opts.help) {
  say(usage());
  process.exit(0);
}
process.exitCode = await main();

async function main() {
  const sets = shaderSets(opts.shaders);
  const chrome = findChrome();
  if (!chrome.path) return skip(chrome.reason);

  const themes = readThemes();
  for (const w of themes.warnings) say(`  ⚠ ${w}`);
  // check-shaders.page.mjs repeats this one line of ShaderSurface.init(); say so if they drift apart.
  if (!/HEADER\s*\+\s*GLSL_COMMON\s*\+\s*this\.options\.fragmentSource/.test(readFileSync(PART_FILES.HEADER, 'utf8'))) {
    say(`  ⚠ ${display(PART_FILES.HEADER)} no longer builds shaders as HEADER + GLSL_COMMON + fragmentSource; ` +
      'make scripts/check-shaders.page.mjs match');
  }

  let script;
  try {
    script = await bundle(sets, pageConfig(themes));
  } catch (err) {
    shout(`✖ shader modules failed to bundle:\n${err.message}`);
    return 1;
  }

  const work = mkdtempSync(join(tmpdir(), 'shader-check-'));
  let chromeRun;
  const t0 = performance.now();
  try {
    writeFileSync(join(work, 'page.js'), script);
    writeFileSync(
      join(work, 'index.html'),
      '<!doctype html>\n<html><head><meta charset="utf-8"><title>shader check</title></head>\n' +
        '<body><script src="page.js"></script></body></html>\n',
    );
    chromeRun = await runChrome(chrome.path, pathToFileURL(join(work, 'index.html')).href, join(work, 'profile'));
  } finally {
    const t1 = performance.now();
    try {
      // Chrome's helpers can hold the profile for a moment after it exits (Windows).
      rmSync(work, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
    } catch (err) {
      if (opts.verbose) say(`  (left ${work} behind: ${err.code ?? err.message})`);
    }
    if (opts.verbose) say(`timing: bundle ${seconds(t0 - started)}, chrome ${seconds(t1 - t0)}, cleanup ${seconds(performance.now() - t1)}`);
  }

  let result;
  try {
    result = JSON.parse(RESULT.exec(chromeRun.stdout)?.[1] ?? 'null');
  } catch {
    // A result cut short; reported below like a missing one.
  }
  if (!result) {
    const why = chromeRun.error
      ? `could not start ${chrome.path}: ${chromeRun.error.message}`
      : chromeRun.timedOut
        ? `Chrome did not finish within ${opts.timeout} s (raise it with --timeout)`
        : `Chrome exited (${chromeRun.signal ?? `code ${chromeRun.code}`}) without a result`;
    shout(`✖ shader ${opts.mode} failed: ${why}`);
    const tail = chromeRun.stderr.trim().split('\n').slice(-15).join('\n');
    if (tail) shout(`  Chrome's stderr ended with:\n${indent(tail, 4)}`);
    return 1;
  }
  if (opts.verbose) {
    say(`timing: page script ${seconds(result.pageMs)}, dump ${(chromeRun.stdout.length / 1e6).toFixed(1)} MB`);
    if (chromeRun.stderr.trim()) say(`Chrome's stderr:\n${indent(chromeRun.stderr.trim(), 2)}\n`);
  }

  for (const w of result.warnings) say(`  ⚠ ${w}`);
  if (result.fatal && !result.shaders.length) {
    shout(`✖ shader ${opts.mode} failed in the page: ${result.fatal}`);
    return 1;
  }
  if (result.selected === 0) {
    shout(`check-shaders: --only ${opts.only.join(', ')} matched no shader. Available: ${result.available.join(', ') || 'none'}`);
    return 2;
  }
  for (const n of result.unmatched) say(`  ⚠ --only ${n} matched no shader`);
  if (!result.webgl2) return skip(`WebGL2 unavailable in headless Chrome (${result.reason})`);

  const count = result.shaders.length;
  const from = sets.length > 1 ? sets.map((s) => `${s.name} = ${s.path}`).join(', ') : sets[0].path;
  say(`shaders: ${count} from ${from}, WebGL2 on ${result.renderer}`);
  for (const s of sets) {
    if (s.common === APP_COMMON && s.dir !== APP_SHADERS) say(`  note: ${s.path} has no common.glsl.ts, so its shaders get the app's GLSL_COMMON`);
  }
  const failed =
    opts.mode === 'render' ? reportRenders(result, sets) :
    opts.mode === 'bench' ? reportBench(result, sets) :
    reportChecks(result, sets);

  if (result.fatal) shout(`✖ ${result.fatal}`);
  const total = seconds(performance.now() - started);
  if (failed || result.fatal) {
    shout(`shader ${opts.mode} failed: ${failed} of ${count} shader(s) had errors (${total}).`);
    return 1;
  }
  say(`shader ${opts.mode} passed (${total}).`);
  return 0;
}

// ------------------------------------------------------------------- options --

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      render: { type: 'boolean' },
      bench: { type: 'boolean' },
      only: { type: 'string', multiple: true },
      shaders: { type: 'string', multiple: true },
      'require-webgl': { type: 'boolean' },
      size: { type: 'string' },
      time: { type: 'string' },
      quality: { type: 'string' },
      theme: { type: 'string' },
      accent: { type: 'string' },
      uniform: { type: 'string', multiple: true },
      out: { type: 'string' },
      frames: { type: 'string' },
      timeout: { type: 'string' },
      'chrome-flag': { type: 'string', multiple: true },
      verbose: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.render && values.bench) throw new Error('--render and --bench are separate runs; pick one');
  const mode = values.render ? 'render' : values.bench ? 'bench' : 'check';
  const frame = ['render', 'bench'];
  const appliesTo = { size: frame, time: frame, quality: frame, theme: frame, accent: frame, uniform: frame, out: ['render'], frames: ['bench'] };
  for (const [flag, modes] of Object.entries(appliesTo)) {
    if (values[flag] !== undefined && !modes.includes(mode)) {
      throw new Error(`--${flag} only applies with ${modes.map((m) => `--${m}`).join(' or ')}`);
    }
  }

  const number = (flag, raw, min = -Infinity, max = Infinity) => {
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n) || n < min || n > max) {
      throw new Error(`${flag} wants a number${min > -Infinity ? ` from ${min}` : ''}${max < Infinity ? ` to ${max}` : ''}, got "${raw}"`);
    }
    return n;
  };
  const size = /^(\d+)\s*[x×*]\s*(\d+)$/i.exec(values.size ?? '960x540');
  if (!size) throw new Error(`--size wants <width>x<height>, e.g. 1280x720; got "${values.size}"`);
  const width = number('--size width', size[1], 1, 8192);
  const height = number('--size height', size[2], 1, 8192);
  const theme = values.theme ?? 'dark';
  if (!['dark', 'light', 'both'].includes(theme)) throw new Error(`--theme wants dark, light or both; got "${theme}"`);
  if (values.accent && !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(values.accent)) {
    throw new Error(`--accent wants a hex colour like #8b5cf6; got "${values.accent}"`);
  }
  const uniforms = (values.uniform ?? []).map((raw) => {
    const m = /^([A-Za-z_]\w*)=(.+)$/.exec(raw);
    if (!m) throw new Error(`--uniform wants <name>=<value>[,<value>…], e.g. uMouse=0.4,-0.2; got "${raw}"`);
    const parsed = m[2].split(',').map((v) => v.trim());
    return {
      name: m[1],
      values: parsed.map((v) => (v === 'true' ? 1 : v === 'false' ? 0 : number(`--uniform ${m[1]}`, v))),
    };
  });

  return {
    help: !!values.help,
    mode,
    only: (values.only ?? []).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean),
    shaders: [...new Set((values.shaders ?? [APP_SHADERS]).map((d) => resolve(d)))],
    requireWebgl: !!values['require-webgl'] || /^(1|true|yes)$/i.test(process.env.SHADER_CHECK_REQUIRE_WEBGL ?? ''),
    width,
    height,
    time: number('--time', values.time ?? '12'),
    quality: number('--quality', values.quality ?? '1', 0, 1),
    themes: theme === 'both' ? ['dark', 'light'] : [theme],
    accent: values.accent ?? null,
    uniforms,
    out: resolve(values.out ?? join(ROOT, 'tmp', 'shader-renders')),
    frames: Math.round(number('--frames', values.frames ?? '30', 1, 10000)),
    timeout: number('--timeout', values.timeout ?? { check: '60', render: '300', bench: '900' }[mode], 1),
    chromeFlags: values['chrome-flag'] ?? [],
    verbose: !!values.verbose,
  };
}

function usage() {
  const lines = readFileSync(fileURLToPath(import.meta.url), 'utf8').split(/\r?\n/);
  const header = [];
  for (const line of lines.slice(2)) {
    if (!line.startsWith('//')) break;
    header.push(line.replace(/^\/\/ ?/, ''));
  }
  return header.join('\n');
}

function skip(reason) {
  if (opts.requireWebgl) {
    shout(`✖ shader ${opts.mode} failed: ${reason} (--require-webgl)`);
    return 1;
  }
  say(`shader ${opts.mode} skipped: ${reason}. Pass --require-webgl to fail instead.`);
  // A green CI run that quietly checked nothing should still be noticed.
  if (process.env.GITHUB_ACTIONS === 'true') say(`::warning title=Shader ${opts.mode} skipped::${reason}`);
  return 0;
}

// ------------------------------------------------------------------- inputs --

/**
 * One set per --shaders directory: its *.frag.ts modules, the GLSL_COMMON that goes with them,
 * and a short unique name (the directory's) for tables and for its folder of PNGs.
 */
function shaderSets(dirs) {
  const seen = new Map();
  return dirs.map((dir, index) => {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) usageError(`--shaders ${display(dir)} is not a directory`);
    const files = readdirSync(dir).filter((f) => f.endsWith('.frag.ts')).sort().map((f) => join(dir, f));
    if (!files.length) usageError(`no *.frag.ts files in ${display(dir)}`);
    const own = join(dir, 'common.glsl.ts');
    let name = basename(dir);
    seen.set(name, (seen.get(name) ?? 0) + 1);
    if (seen.get(name) > 1) name += `-${seen.get(name)}`;
    return { index, dir, path: display(dir), name, files, common: existsSync(own) ? own : APP_COMMON };
  });
}

function usageError(message) {
  shout(`check-shaders: ${message}`);
  process.exit(2);
}

/**
 * Theme inputs, read from where the app keeps them: the accent and page background from the
 * theme tokens in src/styles.scss, the sky from the constants in hero-render.component.ts.
 */
function readThemes() {
  const warnings = [];
  const scss = readFileSync(join(ROOT, 'src', 'styles.scss'), 'utf8');
  const heroFile = join(ROOT, 'src', 'app', 'layout', 'hero-render', 'hero-render.component.ts');
  const hero = readFileSync(heroFile, 'utf8');
  const block = (selector) => {
    const m = selector.exec(scss);
    return m ? scss.slice(m.index + m[0].length, scss.indexOf('}', m.index)) : '';
  };
  const blocks = { light: block(/:root\s*\{/), dark: block(/:root\[data-theme=['"]?dark['"]?\]\s*\{/) };
  const token = (theme, name, fallback) => {
    const value = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(blocks[theme])?.[1].trim();
    if (value && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return value;
    warnings.push(`no hex ${name} for the ${theme} theme in src/styles.scss; using ${fallback}`);
    return fallback;
  };
  const sky = (name, fallback) => {
    const raw = new RegExp(`const\\s+${name}\\b[^=]*=\\s*\\[([^\\]]+)\\]`).exec(hero)?.[1];
    const value = raw?.split(',').map(Number);
    if (value?.length === 3 && value.every(Number.isFinite)) return value;
    warnings.push(`no ${name} in ${display(heroFile)}; using [${fallback}]`);
    return fallback;
  };
  return {
    warnings,
    dark: { name: 'dark', accent: token('dark', '--color-accent', '#8b5cf6'), background: token('dark', '--color-bg', '#07080c'), sky: sky('SKY_DARK', [0.031, 0.039, 0.063]) },
    light: { name: 'light', accent: token('light', '--color-accent', '#482268'), background: token('light', '--color-bg', '#ffffff'), sky: sky('SKY_LIGHT', [0.62, 0.68, 0.8]) },
  };
}

function pageConfig(themes) {
  return {
    mode: opts.mode,
    only: opts.only,
    width: opts.width,
    height: opts.height,
    time: opts.time,
    quality: opts.quality,
    frames: opts.frames,
    warmup: BENCH_WARMUP,
    accent: opts.accent,
    uniforms: opts.uniforms,
    themes: opts.themes.map((t) => themes[t]),
  };
}

/** The page script: check-shaders.page.mjs plus every shader module, as one IIFE. */
async function bundle(sets, config) {
  let esbuild;
  try {
    esbuild = await import('esbuild');
  } catch {
    throw new Error('esbuild is missing; run npm ci (it comes with @angular/build)');
  }
  const spec = (file) => {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    return JSON.stringify(isAbsolute(rel) ? file.replace(/\\/g, '/') : rel.startsWith('.') ? rel : `./${rel}`);
  };
  const lines = [`import { run } from ${spec(PAGE)};`];
  const modules = [];
  for (const set of sets) {
    lines.push(`import { GLSL_COMMON as common${set.index} } from ${spec(set.common)};`);
    for (const file of set.files) {
      const id = `m${modules.length}`;
      lines.push(`import * as ${id} from ${spec(file)};`);
      modules.push(`{ set: ${set.index}, file: ${JSON.stringify(display(file))}, common: common${set.index}, exports: ${id} }`);
    }
  }
  lines.push(`run(${JSON.stringify(config)}, [\n  ${modules.join(',\n  ')}\n]);`);

  try {
    const out = await esbuild.build({
      stdin: { contents: lines.join('\n'), resolveDir: ROOT, sourcefile: 'check-shaders-entry.js', loader: 'js' },
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      write: false,
      logLevel: 'silent',
    });
    return out.outputFiles[0].text;
  } catch (err) {
    if (!err.errors) throw err;
    const messages = await esbuild.formatMessages(err.errors, { kind: 'error', color: false });
    throw new Error(messages.join('').trimEnd());
  }
}

// ------------------------------------------------------------------- chrome --

function findChrome() {
  const fromEnv = process.env.CHROME_BIN;
  if (fromEnv) {
    const path = existsSync(fromEnv) ? fromEnv : which(fromEnv);
    return path ? { path } : { reason: `CHROME_BIN is set to ${fromEnv}, which does not exist` };
  }
  const env = (name) => process.env[name] ?? '';
  const candidates = {
    win32: [
      ...['PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA'].map((v) => env(v) && join(env(v), 'Google', 'Chrome', 'Application', 'chrome.exe')),
      env('LOCALAPPDATA') && join(env('LOCALAPPDATA'), 'Chromium', 'Application', 'chrome.exe'),
      ...['PROGRAMFILES(X86)', 'PROGRAMFILES'].map((v) => env(v) && join(env(v), 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      join(homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
  }[process.platform] ?? [];
  const onPath = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'];
  const path =
    candidates.find((p) => p && existsSync(p)) ??
    onPath.map(which).find(Boolean) ??
    ['/opt/google/chrome/chrome', '/snap/bin/chromium'].find((p) => process.platform === 'linux' && existsSync(p));
  return path ? { path } : { reason: 'Chrome not found; set CHROME_BIN to a Chrome or Chromium binary' };
}

function which(name) {
  const exts = process.platform === 'win32' ? ['', '.exe'] : [''];
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const p = join(dir, name + ext);
      try {
        if (statSync(p).isFile()) return p;
      } catch {
        // not here
      }
    }
  }
  return null;
}

function runChrome(chrome, url, profile) {
  const flags = [
    '--headless=new',
    // WebGL2 without a GPU: ANGLE on SwiftShader, which Chrome only offers when asked to.
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    // A throwaway profile, so an already-running Chrome is left alone.
    `--user-data-dir=${profile}`,
    // Keep Chrome's own background services quiet; on a long --bench they'd share the CPU.
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-default-apps',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-breakpad',
    '--metrics-recording-only',
    '--mute-audio',
    '--disable-features=Translate,OptimizationHints,MediaRouter',
    // Unprivileged Linux runners (GitHub's ubuntu-24.04) can't use the sandbox; see karma.conf.js.
    ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
    ...opts.chromeFlags,
    '--dump-dom',
    url,
  ];
  if (opts.verbose) say(`chrome: ${chrome}\n  ${flags.join('\n  ')}\n`);

  return new Promise((done) => {
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    let settled = false;
    let timer;
    const finish = (extra) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        timedOut,
        ...extra,
      });
    };
    const child = spawn(chrome, flags, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    child.stdout.on('data', (d) => stdout.push(d));
    child.stderr.on('data', (d) => stderr.push(d));
    child.on('error', (error) => finish({ error }));
    child.on('close', (code, signal) => finish({ code, signal }));
    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      // Orphaned helpers can keep the pipes open; don't wait on them.
      setTimeout(() => finish({ code: null, signal: 'SIGTERM' }), 3000).unref();
    }, opts.timeout * 1000);
  });
}

// ------------------------------------------------------------------ reports --

function tag(shader, sets) {
  return sets.length > 1 ? `  [${sets[shader.set].name}]` : '';
}

function reportChecks(result, sets) {
  const width = Math.max(...result.shaders.map((s) => s.name.length));
  let failed = 0;
  for (const shader of result.shaders) {
    if (shader.error) {
      failed++;
      reportError(shader, sets, width);
    } else {
      say(`  ✔ ${shader.name.padEnd(width)}  compiled and linked in ${seconds(shader.compileMs)}${tag(shader, sets)}`);
    }
  }
  return failed;
}

function reportError(shader, sets, width) {
  const { error } = shader;
  const what = error.stage === 'unknown' ? error.message : error.message.split(':')[0];
  shout(`  ✖ ${shader.name.padEnd(width)}  ${shader.exportName}: ${what}${tag(shader, sets)}`);
  if (error.log.trim()) shout(indent(error.log.trim(), 6));
  const places = locate(error, shader, sets);
  for (const place of places) shout(`      ${display(place.path)}:${place.line}\n${place.context}`);
  if (places.length) return;
  shout(`      in ${shader.file}`);
  if (error.annotated) {
    const parts = error.parts?.map((p) => p.name).join(' + ');
    shout(`      ShaderProgram's annotation${parts ? `, numbered as the assembled ${parts}` : ''}:`);
    shout(indent(error.annotated, 6));
  }
}

/**
 * Maps the line numbers in a compile log (lines of the assembled source) to lines of the .ts
 * files the source was assembled from, and checks the text matches before trusting it.
 */
function locate(error, shader, sets) {
  if (!error.parts || !error.source) return [];
  const source = error.source.split('\n');
  const refs = [...error.log.matchAll(/(?:^|\s)\d+:(\d+)\(\d+\)|ERROR:\s*\d+:(\d+)/g)].map((m) => Number(m[1] ?? m[2]));
  const places = [];
  for (const line of [...new Set(refs)].slice(0, 3)) {
    let start = 1;
    let hit = null;
    for (const part of error.parts) {
      if (line >= start) hit = { name: part.name, local: line - start + 1 };
      start += part.newlines;
    }
    if (!hit) continue;
    const path =
      PART_FILES[hit.name] ??
      (hit.name === 'GLSL_COMMON' ? sets[shader.set].common : resolve(shader.file));
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, 'utf8').split('\n').map((l) => l.replace(/\r$/, ''));
    const text = lines.join('\n');
    const literal = new RegExp(`export\\s+const\\s+${hit.name}\\b[^=]*=\\s*(?:/\\*[\\s\\S]*?\\*/\\s*)?\``).exec(text);
    if (!literal) continue;
    const first = text.slice(0, literal.index + literal[0].length).split('\n').length;
    const at = first + hit.local - 1;
    if (lines[at - 1] !== source[line - 1]) continue;
    const from = Math.max(1, at - 3);
    const to = Math.min(lines.length, at + 3);
    const context = [];
    for (let n = from; n <= to; n++) context.push(`      ${n === at ? '>' : ' '} ${String(n).padStart(4)} | ${lines[n - 1]}`);
    places.push({ path, line: at, context: context.join('\n') });
  }
  return places;
}

function reportRenders(result, sets) {
  say(`render: ${opts.width}x${opts.height}, uTime ${opts.time}, uQuality ${opts.quality}, theme ${opts.themes.join(' + ')}`);
  const width = Math.max(...result.shaders.map((s) => s.name.length));
  let failed = 0;
  for (const shader of result.shaders) {
    if (shader.error) {
      failed++;
      reportError(shader, sets, width);
      continue;
    }
    let ok = true;
    for (const run of shader.runs) {
      if (run.errors.length) {
        ok = false;
        shout(`  ✖ ${shader.name.padEnd(width)}  ${run.theme}: ${run.errors.join('; ')}${tag(shader, sets)}`);
        continue;
      }
      const dir = sets.length > 1 ? join(opts.out, sets[shader.set].name) : opts.out;
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${shader.name}.${run.theme}.png`);
      writeFileSync(file, Buffer.from(run.png, 'base64'));
      const notes = [seconds(run.ms)];
      // The canvases are layers over the page; a frame with any transparency is shown over it.
      if (run.transparent) notes.push(`over the page background ${run.background}`);
      say(`  ✔ ${shader.name.padEnd(width)}  ${display(file)}  (${notes.join(', ')})${tag(shader, sets)}`);
      say(`      ${run.uniforms.map((u) => `${u.name} ${formatValue(u.value)}`).join('  ')}`);
      if (run.flat) say(`      ⚠ every pixel is rgb(${run.flat.join(', ')}); is the shader drawing anything?`);
    }
    for (const w of new Set(shader.runs.flatMap((r) => r.warnings))) say(`      ⚠ ${w}`);
    if (!ok) failed++;
  }
  warnUnusedOverrides(result);
  return failed;
}

function reportBench(result, sets) {
  say(`bench: ${opts.frames} frames per shader after ${BENCH_WARMUP} warm-up, ${opts.width}x${opts.height}, ` +
    `uQuality ${opts.quality}, theme ${opts.themes.join(' + ')}, uTime from ${opts.time} s in 1/60 s steps`);
  const rows = [];
  let failed = 0;
  for (const shader of result.shaders) {
    if (shader.error) {
      failed++;
      reportError(shader, sets, shader.name.length);
      continue;
    }
    for (const run of shader.runs) {
      if (run.errors.length) {
        failed++;
        shout(`  ✖ ${shader.name}  ${run.theme}: ${run.errors.join('; ')}${tag(shader, sets)}`);
        continue;
      }
      const sorted = [...run.frameMs].sort((a, b) => a - b);
      const name = opts.themes.length > 1 ? `${shader.name} (${run.theme})` : shader.name;
      rows.push({ name, set: shader.set, median: quantile(sorted, 0.5), p90: quantile(sorted, 0.9), min: sorted[0], first: run.warmupMs[0] });
      if (opts.verbose) say(`  ${name}${tag(shader, sets)} frames, ms: ${run.frameMs.map((v) => v.toFixed(1)).join(' ')}`);
      for (const w of run.warnings) say(`  ⚠ ${shader.name}: ${w}`);
      if (!run.timeVaries) say(`  ⚠ ${shader.name}: has no uTime to advance, so every frame repeats the same work`);
    }
  }

  if (rows.length) {
    // Versions of one shader from several --shaders directories sit together, the first one as the base.
    rows.sort((a, b) => a.name.localeCompare(b.name) || a.set - b.set);
    const several = sets.length > 1;
    const head = ['shader', ...(several ? ['set'] : []), 'median', 'p90', 'min', '1st frame', ...(several ? [`vs ${sets[0].name}`] : [])];
    // Chrome's performance.now() ticks in 0.1 ms, so one decimal is all there is.
    const ms = (v) => `${v.toFixed(1)} ms`;
    const body = rows.map((r, i) => {
      const base = rows.find((o) => o.name === r.name);
      const delta = base === r ? '' : `${(r.median / base.median - 1) * 100 >= 0 ? '+' : ''}${((r.median / base.median - 1) * 100).toFixed(1)}%`;
      const first = i === 0 || rows[i - 1].name !== r.name;
      return [first ? r.name : '', ...(several ? [sets[r.set].name] : []), ms(r.median), ms(r.p90), ms(r.min), ms(r.first), ...(several ? [delta] : [])];
    });
    const widths = head.map((h, c) => Math.max(h.length, ...body.map((row) => row[c].length)));
    const textColumns = several ? 2 : 1;
    for (const row of [head, ...body]) {
      say(`  ${row.map((cell, c) => (c < textColumns ? cell.padEnd(widths[c]) : cell.padStart(widths[c]))).join('  ')}`.trimEnd());
    }
  }
  say(/swiftshader/i.test(result.renderer)
    ? 'note: SwiftShader runs shaders on the CPU, so these times only compare shader versions with each\n' +
      '      other on this machine; they are not GPU frame times. "1st frame" is the first warm-up frame,\n' +
      '      which can include pipeline compilation.'
    : // Measured on Chrome 155 + an RTX 3060: a 2x2 frame still read back at a 32 ms median.
      `note: timed on ${result.renderer}.\n` +
      '      Headless Chrome paces readbacks from a hardware GPU to its frame clock, so these times are\n' +
      '      mostly waiting; the in-app frame HUD measures GPU time properly.');
  warnUnusedOverrides(result);
  return failed;
}

function warnUnusedOverrides(result) {
  const declared = new Set(result.shaders.flatMap((s) => s.declared));
  for (const o of opts.uniforms) {
    if (!declared.has(o.name)) say(`  ⚠ --uniform ${o.name}: no selected shader declares it`);
  }
}

/** Linear-interpolated quantile of an ascending array; 0.5 is the usual median. */
function quantile(sorted, p) {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (h - lo);
}

function formatValue(value) {
  return value.length ? value.map((v) => +v.toFixed(4)).join(',') : '(texture)';
}

function indent(text, n) {
  return text.split('\n').map((l) => ' '.repeat(n) + l).join('\n');
}
