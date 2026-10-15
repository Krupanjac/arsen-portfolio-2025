/**
 * The renderer's palette, read from the `--gfx-*` custom properties in
 * src/styles.scss so the shaders and the page share one source of colour.
 * Re-read on every theme switch; the shaders receive linear-space values.
 */
import { parseCssColor, readThemeColor, srgbToLinear, type Rgb } from './color';
import type { UniformValue } from './shader';

interface PaletteEntry {
  uniform: string;
  cssVar: string;
  /** sRGB fallbacks, used during prerender and if a token is missing. */
  light: string;
  dark: string;
}

// Keep in step with the --gfx-* tokens in src/styles.scss.
const ENTRIES: readonly PaletteEntry[] = [
  { uniform: 'uZenith',   cssVar: '--gfx-sky-zenith',  light: '#a9b6f2', dark: '#0b1233' },
  { uniform: 'uHorizon',  cssVar: '--gfx-sky-horizon', light: '#ece6fb', dark: '#3b2a78' },
  { uniform: 'uGlow',     cssVar: '--gfx-sky-glow',    light: '#f7b8d2', dark: '#f472b6' },
  { uniform: 'uSun',      cssVar: '--gfx-sun',         light: '#fff1dc', dark: '#ffc89a' },
  { uniform: 'uRockLow',  cssVar: '--gfx-rock-low',    light: '#ada1d4', dark: '#1a2147' },
  { uniform: 'uRockHigh', cssVar: '--gfx-rock-high',   light: '#f1ebe5', dark: '#8b7c85' },
  { uniform: 'uStrata',   cssVar: '--gfx-rock-strata', light: '#e9b9c9', dark: '#b56f7e' },
  { uniform: 'uMist',     cssVar: '--gfx-mist',        light: '#f1ecfb', dark: '#4b3fb0' },
  { uniform: 'uInk',      cssVar: '--gfx-ink',         light: '#482268', dark: '#a78bfa' },
  { uniform: 'uInkAlt',   cssVar: '--gfx-ink-alt',     light: '#a23b72', dark: '#f9a8d4' },
];

export type PaletteUniforms = Record<string, UniformValue>;

/** Linear-space uniforms for every palette colour in the given theme. */
export function readPalette(dark: boolean): PaletteUniforms {
  const out: PaletteUniforms = {};
  for (const entry of ENTRIES) {
    const fallback: Rgb = parseCssColor(dark ? entry.dark : entry.light);
    out[entry.uniform] = srgbToLinear(readThemeColor(entry.cssVar, fallback));
  }
  return out;
}

/** The uniform names the palette provides, for shaders and tests. */
export const PALETTE_UNIFORMS: readonly string[] = ENTRIES.map((e) => e.uniform);
