import { createGlBundle, prettyRenderer } from './gl-context';

describe('gl-context', () => {
  describe('createGlBundle', () => {
    let canvas: HTMLCanvasElement;
    let getContext: jasmine.Spy;

    beforeEach(() => {
      canvas = document.createElement('canvas');
      // No real context needed: only the attributes asked for matter here.
      getContext = spyOn(canvas, 'getContext').and.returnValue(null);
    });

    it('lets the browser pick the GPU by default (R8-5)', () => {
      expect(createGlBundle(canvas)).toBeNull();
      expect(getContext).toHaveBeenCalledWith(
        'webgl2',
        jasmine.objectContaining({ powerPreference: 'default' }),
      );
    });

    it('asks for the discrete GPU only when told to', () => {
      createGlBundle(canvas, { powerPreference: 'high-performance' });
      expect(getContext).toHaveBeenCalledWith(
        'webgl2',
        jasmine.objectContaining({ powerPreference: 'high-performance' }),
      );
    });

    it('returns null when getContext throws', () => {
      getContext.and.throwError('blocked');
      expect(createGlBundle(canvas)).toBeNull();
    });
  });

  describe('prettyRenderer', () => {
    it('keeps the device out of an ANGLE string', () => {
      expect(prettyRenderer('ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)')).toBe('Apple M2 Pro');
      expect(prettyRenderer('ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)')).toBe(
        'Apple M2 Pro',
      );
      expect(
        prettyRenderer(
          'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)',
        ),
      ).toBe('NVIDIA GeForce RTX 4070');
    });

    it('keeps the words around a parenthesised aside apart', () => {
      expect(
        prettyRenderer(
          'ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)',
        ),
      ).toBe('Intel UHD Graphics 620');
    });

    it('names the software renderer for what it is', () => {
      expect(
        prettyRenderer(
          'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
        ),
      ).toBe('SwiftShader (software)');
    });

    it('passes other strings through, tidied', () => {
      expect(prettyRenderer('Mali-G78   MP14')).toBe('Mali-G78 MP14');
      expect(prettyRenderer('')).toBe('unknown GPU');
    });
  });
});
