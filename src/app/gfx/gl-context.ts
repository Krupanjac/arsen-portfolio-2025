/**
 * WebGL2 context acquisition and capability probing.
 *
 * Everything here is browser-only — callers must guard with isPlatformBrowser
 * before touching this module.
 */

export interface GpuCapabilities {
  /** Backend actually in use. WebGPU is probed but not yet used for rendering. */
  backend: 'webgl2' | 'none';
  /** True when navigator.gpu exists and an adapter could be requested. */
  webgpuAvailable: boolean;
  /** Unmasked GPU string, e.g. "ANGLE (NVIDIA GeForce RTX 4070 …)". */
  renderer: string;
  vendor: string;
  maxTextureSize: number;
  maxRenderbufferSize: number;
  /** Highest MSAA sample count the default framebuffer reports. */
  maxSamples: number;
  /** Half-float / float colour attachments usable as render targets. */
  colorBufferHalfFloat: boolean;
  colorBufferFloat: boolean;
  /** GPU-side timer queries — required for honest GPU frame time. */
  timerQuery: boolean;
  anisotropy: number;
  /** Device pixel ratio at construction time. */
  devicePixelRatio: number;
}

export interface GlBundle {
  gl: WebGL2RenderingContext;
  caps: GpuCapabilities;
  ext: {
    timer: any | null;
    aniso: any | null;
  };
}

export interface GlContextOptions {
  /**
   * GPU selection hint. 'default' lets the browser choose, which on a dual-GPU
   * laptop normally means the integrated one; 'high-performance' wakes the
   * discrete GPU and keeps it awake for as long as the context lives. Opt in
   * per surface, only where the cost is worth it.
   */
  powerPreference?: WebGLPowerPreference;
}

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: false, // we render to an offscreen target and resolve ourselves
  depth: false,
  stencil: false,
  desynchronized: true,
  powerPreference: 'default',
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  failIfMajorPerformanceCaveat: false,
};

export function createGlBundle(
  canvas: HTMLCanvasElement,
  options: GlContextOptions = {},
): GlBundle | null {
  const attributes: WebGLContextAttributes = {
    ...CONTEXT_ATTRIBUTES,
    powerPreference: options.powerPreference ?? CONTEXT_ATTRIBUTES.powerPreference,
  };
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl2', attributes) as WebGL2RenderingContext | null;
  } catch {
    gl = null;
  }
  if (!gl) return null;

  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const aniso =
    gl.getExtension('EXT_texture_filter_anisotropic') ??
    gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

  const halfFloatBuffer = gl.getExtension('EXT_color_buffer_half_float');
  const floatBuffer = gl.getExtension('EXT_color_buffer_float');

  const caps: GpuCapabilities = {
    backend: 'webgl2',
    webgpuAvailable: typeof navigator !== 'undefined' && 'gpu' in navigator,
    renderer: debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? 'unknown')
      : String(gl.getParameter(gl.RENDERER) ?? 'unknown'),
    vendor: debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) ?? 'unknown')
      : String(gl.getParameter(gl.VENDOR) ?? 'unknown'),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
    maxSamples: gl.getParameter(gl.MAX_SAMPLES) as number,
    // EXT_color_buffer_float makes the half-float formats renderable as well.
    colorBufferHalfFloat: !!halfFloatBuffer || !!floatBuffer,
    colorBufferFloat: !!floatBuffer,
    timerQuery: !!timer,
    anisotropy: aniso ? (gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number) : 1,
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  };

  return { gl, caps, ext: { timer, aniso } };
}

/**
 * Condenses a raw unmasked renderer string into something a person can read.
 * "ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)" -> "Apple M2 Pro"
 * "ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 …)" -> "Intel UHD Graphics 620"
 */
export function prettyRenderer(raw: string): string {
  if (!raw) return 'unknown GPU';
  // ANGLE's software fallback names a Vulkan version as its device; say what it is.
  if (/swiftshader/i.test(raw)) return 'SwiftShader (software)';
  const angle = raw.match(/^ANGLE \((.+)\)$/);
  if (angle) {
    const parts = angle[1].split(',').map((p) => p.trim());
    // ANGLE reports "vendor, device, driver" — the device is the interesting one.
    const device = parts.length >= 2 ? parts[1] : parts[0];
    const name = device
      .replace(/^ANGLE Metal Renderer:\s*/i, '')
      // Parenthesised asides ("(R)", PCI ids) become spaces, not nothing, so
      // "Intel(R) UHD" does not collapse into "IntelUHD".
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .replace(/[()]/g, '')
      .replace(/Direct3D.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    return name || raw;
  }
  return raw.replace(/\s+/g, ' ').trim();
}
