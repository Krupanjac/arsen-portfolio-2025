import { PALETTE_UNIFORMS, readPalette } from './palette';

describe('readPalette', () => {
  const root = document.documentElement;

  afterEach(() => root.style.removeProperty('--gfx-sun'));

  it('provides every palette uniform as a linear RGB triple in [0, 1]', () => {
    for (const dark of [true, false]) {
      const palette = readPalette(dark);
      expect(Object.keys(palette).sort()).toEqual([...PALETTE_UNIFORMS].sort());
      for (const name of PALETTE_UNIFORMS) {
        const rgb = palette[name] as number[];
        expect(rgb.length).withContext(name).toBe(3);
        for (const c of rgb) {
          expect(c).withContext(name).toBeGreaterThanOrEqual(0);
          expect(c).withContext(name).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('reads the --gfx-* tokens from CSS and converts them to linear', () => {
    root.style.setProperty('--gfx-sun', '#ff8000');
    const [r, g, b] = readPalette(true)['uSun'] as number[];
    expect(r).toBeCloseTo(1, 5);
    // sRGB 0x80 (0.502) is ~0.216 in linear light.
    expect(g).toBeCloseTo(0.216, 2);
    expect(b).toBeCloseTo(0, 5);
  });
});
