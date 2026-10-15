import { parseCssColor, readThemeColor, srgbToLinear, type Rgb } from './color';

const FALLBACK: Rgb = [0.1, 0.2, 0.3];

function expectRgb(actual: Rgb, expected: Rgb): void {
  expect(actual.length).toBe(3);
  actual.forEach((c, i) => expect(c).toBeCloseTo(expected[i], 6));
}

describe('color', () => {
  describe('parseCssColor', () => {
    it('reads six-digit hex, the form the theme tokens use', () => {
      expectRgb(parseCssColor('#8b5cf6'), [139 / 255, 92 / 255, 246 / 255]);
      expectRgb(parseCssColor('#482268'), [72 / 255, 34 / 255, 104 / 255]);
    });

    it('expands three- and four-digit shorthand, ignoring alpha', () => {
      expectRgb(parseCssColor('#fff'), [1, 1, 1]);
      expectRgb(parseCssColor('#f80'), [1, 0x88 / 255, 0]);
      expectRgb(parseCssColor('#f808'), [1, 0x88 / 255, 0]);
      expectRgb(parseCssColor('#8b5cf680'), [139 / 255, 92 / 255, 246 / 255]);
    });

    it('trims whitespace, as getPropertyValue returns it', () => {
      expectRgb(parseCssColor('  #000000 '), [0, 0, 0]);
    });

    it('reads rgb() in both syntaxes, and the bare channel triple', () => {
      const expected: Rgb = [72 / 255, 34 / 255, 104 / 255];
      expectRgb(parseCssColor('rgb(72 34 104)'), expected);
      expectRgb(parseCssColor('rgb(72, 34, 104)'), expected);
      expectRgb(parseCssColor('rgba(72, 34, 104, 0.5)'), expected);
      expectRgb(parseCssColor('rgb(72 34 104 / .5)'), expected);
      expectRgb(parseCssColor('72 34 104'), expected);
    });

    it('reads percentage channels and clamps out-of-range ones', () => {
      expectRgb(parseCssColor('rgb(100% 0% 50%)'), [1, 0, 0.5]);
      expectRgb(parseCssColor('rgb(300 -20 128)'), [1, 0, 128 / 255]);
    });

    it('falls back on anything it does not understand', () => {
      for (const input of ['', '   ', 'red', '#12', '#12zzzz', '#1234567', 'hsl(270 50% 40%)', '72 34']) {
        expect(parseCssColor(input, FALLBACK)).withContext(input).toEqual(FALLBACK);
      }
      expect(parseCssColor(undefined as unknown as string, FALLBACK)).toEqual(FALLBACK);
    });

    it('has a mid-grey default fallback', () => {
      expect(parseCssColor('nonsense')).toEqual([0.5, 0.5, 0.5]);
    });
  });

  describe('srgbToLinear', () => {
    it('keeps the ends fixed and darkens the middle', () => {
      expectRgb(srgbToLinear([0, 1, 0.5]), [0, 1, 0.21404114]);
    });

    it('uses the linear segment near black', () => {
      expect(srgbToLinear([0.04, 0, 0])[0]).toBeCloseTo(0.04 / 12.92, 9);
    });
  });

  describe('readThemeColor', () => {
    const root = document.documentElement;

    afterEach(() => root.style.removeProperty('--gfx-spec-color'));

    it('reads a custom property off the root element', () => {
      root.style.setProperty('--gfx-spec-color', '#ff0000');
      expectRgb(readThemeColor('--gfx-spec-color', FALLBACK), [1, 0, 0]);
    });

    it('falls back when the property is not set', () => {
      expect(readThemeColor('--gfx-spec-color', FALLBACK)).toEqual(FALLBACK);
    });
  });
});
