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

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: false, // we render to an offscreen target and resolve ourselves
  depth: false,
  stencil: false,
  desynchronized: true,
  powerPreference: 'high-performance',
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  failIfMajorPerformanceCaveat: false,
};

export function createGlBundle(canvas: HTMLCanvasElement): GlBundle | null {
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES) as WebGL2RenderingContext | null;
  } catch {
    gl = null;
  }
  if (!gl) return null;

  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const aniso =
    gl.getExtension('EXT_texture_filter_anisotropic') ??
    gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

  gl.getExtension('EXT_color_buffer_half_float');
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
    colorBufferHalfFloat: true,
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
 */
export function prettyRenderer(raw: string): string {
  if (!raw) return 'unknown GPU';
  const angle = raw.match(/^ANGLE \((.+)\)$/);
  if (angle) {
    const parts = angle[1].split(',').map((p) => p.trim());
    // ANGLE reports "vendor, device, driver" — the device is the interesting one.
    const device = parts.length >= 2 ? parts[1] : parts[0];
    return device.replace(/\s*\(.*?\)\s*/g, '').replace(/Direct3D.*$/i, '').trim() || raw;
  }
  return raw.replace(/\s+/g, ' ').trim();
}
