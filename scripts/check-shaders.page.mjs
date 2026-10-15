// scripts/check-shaders.page.mjs
// The in-browser half of scripts/check-shaders.mjs. Node can't run this file: check-shaders.mjs
// bundles it with esbuild, together with the *.frag.ts shader modules, into a classic script for
// a headless Chrome page, then reads back the JSON it leaves in the DOM.
//
// Everything GL-facing goes through the app's own modules (createGlBundle, ShaderProgram,
// FullscreenPass, HEADER, FULLSCREEN_VERTEX_SHADER), so a shader that passes here was compiled
// and linked the way ShaderSurface.init() does it.

import { parseCssColor, srgbToLinear } from '../src/app/gfx/color';
import { FULLSCREEN_VERTEX_SHADER, FullscreenPass } from '../src/app/gfx/fullscreen-pass';
import { createGlBundle } from '../src/app/gfx/gl-context';
import { ShaderCompileError, ShaderProgram } from '../src/app/gfx/shader';
import { HEADER } from '../src/app/gfx/shader-surface';

// check-shaders.mjs looks for this id in Chrome's --dump-dom output.
const RESULT_ID = 'shader-check-result';

/**
 * @param {object} config  see pageConfig() in check-shaders.mjs
 * @param {{ set: number, file: string, common: string, exports: Record<string, unknown> }[]} modules
 *   one per *.frag.ts file; `common` is the GLSL_COMMON that belongs with it
 */
export function run(config, modules) {
  const t0 = performance.now();
  const result = { webgl2: false, available: [], shaders: [], warnings: [] };
  try {
    check(config, modules, result);
  } catch (err) {
    result.fatal = String((err && err.stack) || err);
  }
  result.pageMs = performance.now() - t0;
  const out = document.createElement('script');
  out.type = 'application/json';
  out.id = RESULT_ID;
  // Script text is serialised raw by --dump-dom; escaping "<" keeps "</script>" out of it.
  out.textContent = JSON.stringify(result).replace(/</g, '\\u003c');
  document.body.appendChild(out);
}

function check(config, modules, result) {
  // Any exported string with a main() in a *.frag.ts module is a fragment shader.
  const found = [];
  for (const { set, file, common, exports } of modules) {
    const shaders = Object.entries(exports).filter(
      ([, value]) => typeof value === 'string' && /\bvoid\s+main\s*\(/.test(value),
    );
    if (!shaders.length) result.warnings.push(`${file} exports no fragment shader (no string with a main())`);
    const stem = file.split('/').pop().replace(/\.frag\.ts$/, '');
    for (const [exportName, source] of shaders) {
      const name = shaders.length > 1 ? `${stem}.${exportName.toLowerCase().replace(/_/g, '-')}` : stem;
      found.push({ name, set, file, exportName, source, common });
    }
  }
  result.available = [...new Set(found.map((s) => s.name))];

  const matches = (s, o) => s.name.toLowerCase() === o.toLowerCase() || s.exportName.toLowerCase() === o.toLowerCase();
  const selected = config.only.length ? found.filter((s) => config.only.some((o) => matches(s, o))) : found;
  result.unmatched = config.only.filter((o) => !found.some((s) => matches(s, o)));
  result.selected = selected.length;
  if (!selected.length) return;

  // The context the app would get: same helper, same attributes.
  const canvas = document.createElement('canvas');
  canvas.width = config.width;
  canvas.height = config.height;
  let reason = '';
  canvas.addEventListener('webglcontextcreationerror', (e) => {
    reason = e.statusMessage || reason;
  });
  const bundle = createGlBundle(canvas);
  if (!bundle) {
    const webgl1 = !!document.createElement('canvas').getContext('webgl');
    result.reason = reason || (webgl1 ? 'WebGL1 works, WebGL2 does not' : 'no WebGL context at all');
    return;
  }
  result.webgl2 = true;
  const { gl, caps } = bundle;
  result.renderer = caps.renderer;

  // The fixed state ShaderSurface.init() sets.
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);

  const lost = () => {
    if (!gl.isContextLost()) return false;
    result.fatal = 'the WebGL context was lost (GPU process crash?); the remaining work was skipped';
    return true;
  };
  const compiled = [];
  for (const shader of selected) {
    const { entry, program, declared } = compile(gl, shader);
    result.shaders.push(entry);
    if (program && config.mode === 'check') program.dispose();
    else if (program) compiled.push({ entry, program, declared });
    if (lost()) break;
  }
  if (!compiled.length) return;

  const pass = new FullscreenPass(gl);
  if (config.mode === 'render') {
    for (const { entry, program, declared } of compiled) {
      for (const theme of config.themes) {
        if (!lost()) entry.runs.push(renderFrame(gl, program, pass, declared, config, theme));
      }
    }
  } else {
    // Versions of one shader from several --shaders directories are timed together.
    const groups = new Map();
    for (const c of compiled) groups.set(c.entry.name, [...(groups.get(c.entry.name) ?? []), c]);
    for (const group of groups.values()) {
      for (const theme of config.themes) if (!lost()) benchGroup(gl, pass, group, config, theme);
    }
  }
  for (const { program } of compiled) program.dispose();
  pass.dispose();
}

function compile(gl, shader) {
  const { name, set, file, exportName } = shader;
  const entry = { name, set, file, exportName, runs: [] };

  // Assembled exactly as ShaderSurface.init() does it.
  const fragmentSource = HEADER + shader.common + shader.source;
  const declared = declaredUniforms(fragmentSource);
  entry.declared = declared.map((u) => u.name);

  const t0 = performance.now();
  try {
    const program = new ShaderProgram(gl, FULLSCREEN_VERTEX_SHADER, fragmentSource);
    entry.compileMs = performance.now() - t0;
    return { entry, program, declared };
  } catch (err) {
    entry.compileMs = performance.now() - t0;
    entry.error = describeError(err, shader, fragmentSource);
    return { entry };
  }
}

function describeError(err, shader, fragmentSource) {
  if (!(err instanceof ShaderCompileError)) {
    return { stage: 'unknown', message: String((err && err.message) || err), log: '', annotated: '' };
  }
  const error = { stage: err.stage, message: err.message, log: err.log, annotated: err.annotated };
  // What the source was made of, so check-shaders.mjs can map log lines back to .ts files.
  if (err.stage === 'vertex') {
    error.source = FULLSCREEN_VERTEX_SHADER;
    error.parts = [part('FULLSCREEN_VERTEX_SHADER', FULLSCREEN_VERTEX_SHADER)];
  } else if (err.stage === 'fragment') {
    error.source = fragmentSource;
    error.parts = [part('HEADER', HEADER), part('GLSL_COMMON', shader.common), part(shader.exportName, shader.source)];
  }
  return error;
}

function part(name, text) {
  return { name, newlines: text.split('\n').length - 1 };
}

// ---------------------------------------------------------- render / bench --

function renderFrame(gl, program, pass, declared, config, theme) {
  const t0 = performance.now();
  const { width, height } = config;
  const { run } = applyUniforms(gl, program, declared, config, theme);
  if (run.errors.length) return run;

  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  pass.draw();

  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const problem = glProblem(gl, 'rendering');
  if (problem) {
    run.errors.push(problem);
    return run;
  }
  run.ms = performance.now() - t0;

  const background = parseCssColor(theme.background).map((c) => c * 255);
  return Object.assign(run, { background: theme.background }, encode(pixels, width, height, background));
}

/**
 * Times whole frames of every version of one shader. Each frame gets a new uTime, so no two are
 * the same work, and ends on a 1-pixel readback, which can't return before the GPU (here:
 * SwiftShader) has finished it. The versions take turns frame by frame, so a busy moment on the
 * machine lands on all of them alike. The warm-up frames also pay for pipeline creation and are
 * reported apart.
 */
function benchGroup(gl, pass, group, config, theme) {
  gl.viewport(0, 0, config.width, config.height);
  const pixel = new Uint8Array(4);
  const members = [];
  for (const { entry, program, declared } of group) {
    // Uniforms are per-program state, so each version keeps its own between turns.
    const { run, clocks } = applyUniforms(gl, program, declared, config, theme);
    entry.runs.push(run);
    if (!run.errors.length) members.push({ run, program, clocks });
  }
  const frame = ({ program, clocks }, i) => {
    program.use();
    for (const loc of clocks) gl.uniform1f(loc, config.time + i / 60);
    const t0 = performance.now();
    pass.draw();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return performance.now() - t0;
  };
  for (const m of members) {
    m.run.warmupMs = [];
    for (let i = 0; i < config.warmup; i++) m.run.warmupMs.push(frame(m, i));
    m.run.frameMs = [];
    m.run.timeVaries = m.clocks.length > 0;
  }
  for (let i = config.warmup; i < config.warmup + config.frames; i++) {
    for (const m of members) m.run.frameMs.push(frame(m, i));
  }
  const problem = glProblem(gl, 'benchmarking');
  for (const m of members) if (problem) m.run.errors.push(problem);
}

function glProblem(gl, what) {
  if (gl.isContextLost()) return `the WebGL context was lost while ${what}`;
  const error = gl.getError();
  return error === gl.NO_ERROR ? null : `WebGL error 0x${error.toString(16)} while ${what}`;
}

/**
 * Flips the bottom-up readback, composites it over the page background (the canvases are
 * premultiplied-alpha layers over the page, and the contour field is mostly transparent), and
 * PNG-encodes it. Also reports whether the frame is one flat colour, the usual sign of a shader
 * that compiles but draws nothing.
 */
function encode(pixels, width, height, background) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  const out = image.data;
  const min = [255, 255, 255];
  const max = [0, 0, 0];
  let transparent = false;
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * row;
    const dst = y * row;
    for (let x = 0; x < row; x += 4) {
      const alpha = pixels[src + x + 3];
      if (alpha < 255) transparent = true;
      const keep = 1 - alpha / 255;
      for (let c = 0; c < 3; c++) {
        const v = Math.min(255, Math.round(pixels[src + x + c] + background[c] * keep));
        out[dst + x + c] = v;
        if (v < min[c]) min[c] = v;
        if (v > max[c]) max[c] = v;
      }
      out[dst + x + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return {
    png: canvas.toDataURL('image/png').slice('data:image/png;base64,'.length),
    flat: max.every((v, c) => v - min[c] <= 2) ? min : null,
    transparent,
  };
}

// ---------------------------------------------------------------- uniforms --

const VECTORS = {
  float: 1, vec2: 2, vec3: 3, vec4: 4,
  int: 1, ivec2: 2, ivec3: 3, ivec4: 4,
  uint: 1, uvec2: 2, uvec3: 3, uvec4: 4,
  bool: 1, bvec2: 2, bvec3: 3, bvec4: 4,
};
const MATRICES = {
  mat2: [2, 2], mat3: [3, 3], mat4: [4, 4],
  mat2x2: [2, 2], mat2x3: [2, 3], mat2x4: [2, 4],
  mat3x2: [3, 2], mat3x3: [3, 3], mat3x4: [3, 4],
  mat4x2: [4, 2], mat4x3: [4, 3], mat4x4: [4, 4],
};
const isSampler = (type) => type.includes('sampler');

/** Every `uniform <type> <name>[, <name>…];` in the source, comments stripped first. */
function declaredUniforms(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
  const found = [];
  const seen = new Set();
  for (const m of code.matchAll(/\buniform\s+(?:(?:lowp|mediump|highp)\s+)?([A-Za-z_]\w*)\s+([^;{]+);/g)) {
    for (const declarator of m[2].split(',')) {
      const d = /^\s*([A-Za-z_]\w*)\s*(?:\[\s*(\d+)\s*\])?\s*$/.exec(declarator);
      if (!d || seen.has(d[1])) continue;
      seen.add(d[1]);
      found.push({ type: m[1], name: d[1], length: d[2] ? Number(d[2]) : 1 });
    }
  }
  return found;
}

function applyUniforms(gl, program, declared, config, theme) {
  // Theme-dependent values, converted the way hero-render.component.ts converts them.
  const values = {
    accent: srgbToLinear(parseCssColor(config.accent || theme.accent)),
    sky: srgbToLinear(theme.sky),
    theme: theme.name === 'dark' ? 1 : 0,
  };
  const run = { theme: theme.name, uniforms: [], errors: [], warnings: [] };
  const clocks = []; // locations that carry the time, advanced per frame by --bench

  gl.getError(); // start from a clean slate
  program.use();
  let unit = 0;
  for (const u of declared) {
    const assigned = assign(u, config, values);
    if (assigned.error) {
      run.errors.push(assigned.error);
      continue;
    }
    if (assigned.warning) run.warnings.push(assigned.warning);
    if (assigned.skip) continue;
    run.uniforms.push({ name: u.name, type: u.type, value: assigned.value, from: assigned.from });
    unit = upload(gl, program.program, u, assigned.value, unit);
    const loc = assigned.clock && gl.getUniformLocation(program.program, u.name);
    if (loc) clocks.push(loc);
  }
  return { run, clocks };
}

function components(type) {
  if (type in VECTORS) return VECTORS[type];
  if (type in MATRICES) return MATRICES[type][0] * MATRICES[type][1];
  return 1; // a sampler takes one texture unit
}

/**
 * The app's names first (values as hero-render.component.ts passes them), then a guess from the
 * name for uniforms a future shader might add, then a neutral value for the type.
 * --uniform beats all of them.
 */
function assign(u, config, values) {
  const size = components(u.type) * u.length;
  const override = config.uniforms.find((o) => o.name === u.name);
  if (!(u.type in VECTORS || u.type in MATRICES || isSampler(u.type))) {
    // A struct, most likely; its members would need setting one by one.
    if (override) return { error: `--uniform ${u.name}: can't set a ${u.type} from the command line` };
    return { skip: true, warning: `${u.name} (${u.type}) is not a type this tool can set, so it stays zero` };
  }
  if (override) {
    if (isSampler(u.type)) return { error: `--uniform ${u.name}: samplers can't be set from the command line` };
    if (override.values.length !== size) {
      const decl = `${u.type}${u.length > 1 ? `[${u.length}]` : ''}`;
      return { error: `--uniform ${u.name} needs ${size} value(s) for ${decl}, got ${override.values.length}` };
    }
    return { value: override.values, from: 'override' };
  }
  if (isSampler(u.type)) {
    const what = u.type === 'sampler2D' ? 'a 1x1 mid-grey texture' : 'nothing (samples as zero)';
    return { value: [], from: 'default', warning: `${u.name} (${u.type}) is bound to ${what}` };
  }

  const known = {
    uResolution: [config.width, config.height],
    uTime: [config.time],
    uMouse: [0, 0], // pointer at the centre
    uScroll: [0], // top of the page
    uAccent: values.accent,
    uSky: values.sky,
    uQuality: [config.quality],
    uTheme: [values.theme],
  };
  if (u.length === 1 && known[u.name]?.length === size) {
    return { value: [...known[u.name]], from: 'app', clock: u.name === 'uTime' };
  }

  // Anchored at the end, so iTime and u_resolution match but uTimeScale doesn't.
  const guesses = [
    { pattern: /time$/i, type: 'float', value: [config.time], clock: true },
    { pattern: /(resolution|viewport)$/i, type: 'vec2', value: [config.width, config.height] },
    { pattern: /(mouse|pointer|cursor)$/i, type: 'vec2', value: [0, 0] },
    { pattern: /scroll$/i, type: 'float', value: [0] },
    { pattern: /accent$/i, type: 'vec3', value: values.accent },
    { pattern: /sky$/i, type: 'vec3', value: values.sky },
    { pattern: /quality$/i, type: 'float', value: [config.quality] },
    { pattern: /(theme|night|dark)$/i, type: 'float', value: [values.theme] },
  ];
  const guess = u.length === 1 && guesses.find((g) => g.type === u.type && g.pattern.test(u.name));
  if (guess) {
    return {
      value: [...guess.value],
      from: 'guess',
      clock: !!guess.clock,
      warning: `${u.name} (${u.type}) is not one the app sets; guessed from its name`,
    };
  }

  const matrix = MATRICES[u.type];
  const one = matrix ? identity(...matrix) : new Array(components(u.type)).fill(0);
  return {
    value: Array.from({ length: u.length }, () => one).flat(),
    from: 'default',
    warning: `${u.name} (${u.type}) has no known value, using ${matrix ? 'identity' : 'zero'}; set it with --uniform ${u.name}=…`,
  };
}

function identity(columns, rows) {
  const m = [];
  for (let c = 0; c < columns; c++) for (let r = 0; r < rows; r++) m.push(c === r ? 1 : 0);
  return m;
}

let greyTexture = null;

/** Uploads one uniform by its declared type; returns the next free texture unit. */
function upload(gl, program, u, value, unit) {
  const loc = gl.getUniformLocation(program, u.name);
  const units = isSampler(u.type) ? u.length : 0;
  // Optimised out. The app's ShaderProgram.set() skips these too.
  if (loc === null) return unit + units;

  if (units) {
    const list = Array.from({ length: units }, (_, i) => unit + i);
    if (u.type === 'sampler2D') {
      greyTexture ??= makeGreyTexture(gl);
      for (const n of list) {
        gl.activeTexture(gl.TEXTURE0 + n);
        gl.bindTexture(gl.TEXTURE_2D, greyTexture);
      }
    }
    // Distinct units even when unbound: two sampler types on one unit is a draw-time error.
    gl.uniform1iv(loc, list);
    return unit + units;
  }

  const matrix = MATRICES[u.type];
  if (matrix) {
    const [c, r] = matrix;
    gl[c === r ? `uniformMatrix${c}fv` : `uniformMatrix${c}x${r}fv`](loc, false, value);
  } else if (/^(uint|uvec)/.test(u.type)) {
    gl[`uniform${VECTORS[u.type]}uiv`](loc, value);
  } else if (/^(int|bool|ivec|bvec)/.test(u.type)) {
    gl[`uniform${VECTORS[u.type]}iv`](loc, value.map(Math.trunc));
  } else {
    gl[`uniform${VECTORS[u.type]}fv`](loc, value);
  }
  return unit;
}

function makeGreyTexture(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  const grey = new Uint8Array([128, 128, 128, 255]);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, grey);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return texture;
}
