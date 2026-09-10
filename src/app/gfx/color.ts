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

/** Accepts "#rgb", "#rrggbb", "rgb(r g b)", "rgb(r, g, b)" and "r g b". */
export function parseCssColor(input: string, fallback: Rgb = [0.5, 0.5, 0.5]): Rgb {
  const value = (input || '').trim();
  if (!value) return fallback;

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const expand = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
    if (expand.length < 6) return fallback;
    const n = parseInt(expand.slice(0, 6), 16);
    if (Number.isNaN(n)) return fallback;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // Covers both "rgb(72 34 104)" and the bare "72 34 104" form the theme uses
  // for its --color-accent-rgb token.
  const nums = value.match(/-?\d*\.?\d+/g);
  if (nums && nums.length >= 3) {
    return [Number(nums[0]) / 255, Number(nums[1]) / 255, Number(nums[2]) / 255];
  }
  return fallback;
}

export function readThemeColor(cssVar: string, fallback: Rgb): Rgb {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar);
  return parseCssColor(raw, fallback);
}
