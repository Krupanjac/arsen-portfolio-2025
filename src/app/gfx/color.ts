/** sRGB -> linear, and CSS colour parsing for feeding theme values into shaders. */

export type Rgb = [number, number, number];

function srgbToLinearChannel(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function srgbToLinear(rgb: Rgb): Rgb {
  return [
    srgbToLinearChannel(rgb[0]),
    srgbToLinearChannel(rgb[1]),
    srgbToLinearChannel(rgb[2]),
  ];
}

const HEX_COLOR = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_CHANNEL = /-?(?:\d+\.?\d*|\.\d+)%?/g;

function channel(token: string): number {
  // "50%" is half of full scale; a bare number is on the 0-255 scale.
  const value = token.endsWith('%') ? parseFloat(token) / 100 : parseFloat(token) / 255;
  return Math.min(1, Math.max(0, value));
}

/**
 * Accepts "#rgb", "#rgba", "#rrggbb", "#rrggbbaa", "rgb(r g b)", "rgb(r, g, b)"
 * (channels as numbers or percentages, alpha ignored) and the bare "r g b".
 * Anything else, named colours and hsl() included, returns `fallback`.
 */
export function parseCssColor(input: string, fallback: Rgb = [0.5, 0.5, 0.5]): Rgb {
  const value = (input || '').trim();
  if (!value) return fallback;

  if (value.startsWith('#')) {
    // Validate first: parseInt stops at the first bad digit, so "#12zzzz"
    // would otherwise come back as a colour instead of the fallback.
    if (!HEX_COLOR.test(value)) return fallback;
    const hex = value.slice(1);
    const expand = hex.length <= 4 ? hex.replace(/./g, (c) => c + c) : hex;
    const n = parseInt(expand.slice(0, 6), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // Covers both "rgb(72 34 104)" and the bare "72 34 104" form the theme uses
  // for its --color-accent-rgb token.
  if (!/^(rgba?\(.*\)|[-\d.%\s,]+)$/i.test(value)) return fallback;
  const nums = value.match(RGB_CHANNEL);
  if (nums && nums.length >= 3) {
    return [channel(nums[0]), channel(nums[1]), channel(nums[2])];
  }
  return fallback;
}

export function readThemeColor(cssVar: string, fallback: Rgb): Rgb {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar);
  return parseCssColor(raw, fallback);
}
