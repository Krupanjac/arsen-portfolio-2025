/**
 * A single full-canvas fragment-shader pass with dynamic resolution, honest
 * frame timing, and the lifecycle plumbing a long-lived canvas on a scrolling
 * page needs (context loss, resize, occlusion, tab visibility).
 *
 * Framework-agnostic on purpose — the Angular component around it only wires
 * inputs and outputs.
 */

import { createGlBundle, prettyRenderer, type GpuCapabilities } from './gl-context';
import { FULLSCREEN_VERTEX_SHADER, FullscreenPass } from './fullscreen-pass';
import { FrameTimer, type FrameStats } from './frame-timer';
import { RenderLoop, prefersReducedMotion } from './render-loop';
import { ResolutionScaler } from './resolution-scaler';
import { ShaderProgram, ShaderCompileError, type UniformValue } from './shader';
import { GLSL_COMMON } from './shaders/common.glsl';

export interface ShaderSurfaceOptions {
  fragmentSource: string;
  /** Called every frame; return the uniforms for that frame. */
  uniforms: (elapsed: number, delta: number) => Record<string, UniformValue>;
  onStats?: (stats: FrameStats) => void;
  onError?: (error: Error) => void;
  onReady?: (caps: GpuCapabilities) => void;
  targetFps?: number;
  /** Upper bound on device pixel ratio. 2 is plenty for a shader this heavy. */
  maxDpr?: number;
}

/**
 * Prepended to every fragment source, ahead of the shared GLSL.
 *
 * The precision statements have to live here, not in the individual shaders:
 * ES 3.00 fragment shaders declare no default float precision, and the shared
 * library is concatenated first — a `precision` line further down the file
 * arrives after the functions that need it.
 */
export const HEADER = [
  '#version 300 es',
  'precision highp float;',
  'precision highp int;',
  '',
].join('\n');

export class ShaderSurface {
  private bundle: ReturnType<typeof createGlBundle> = null;
  private program: ShaderProgram | null = null;
  private pass: FullscreenPass | null = null;
  private timer: FrameTimer | null = null;
  private loop: RenderLoop | null = null;
  private readonly scaler: ResolutionScaler;

  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;

  private cssWidth = 1;
  private cssHeight = 1;
  private dpr = 1;
  private appliedScale = 0;
  private statsTick = 0;
  private disposed = false;

  readonly reducedMotion = prefersReducedMotion();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: ShaderSurfaceOptions,
  ) {
    this.scaler = new ResolutionScaler({
      targetMs: 1000 / (options.targetFps ?? 60),
      // Reduced motion still renders, just once and at full quality — the
      // scene is static then, so there is no frame budget to defend.
      minScale: this.reducedMotion ? 1 : 0.45,
    });
  }

  get capabilities(): GpuCapabilities | null {
    return this.bundle?.caps ?? null;
  }

  get gpuName(): string {
    return this.bundle ? prettyRenderer(this.bundle.caps.renderer) : '';
  }

  get resolutionScaler(): ResolutionScaler {
    return this.scaler;
  }

  init(): boolean {
    this.bundle = createGlBundle(this.canvas);
    if (!this.bundle) {
      this.options.onError?.(new Error('WebGL2 is not available in this browser.'));
      return false;
    }
    const { gl, ext, caps } = this.bundle;

    try {
      this.program = new ShaderProgram(
        gl,
        FULLSCREEN_VERTEX_SHADER,
        HEADER + GLSL_COMMON + this.options.fragmentSource,
      );
    } catch (err) {
      if (err instanceof ShaderCompileError) {
        // The annotated source is the useful half — surface it to the console
        // where it can actually be read, and hand the caller the summary.
        console.error(`[gfx] ${err.message}\n${err.annotated}`);
      }
      this.options.onError?.(err as Error);
      return false;
    }

    this.pass = new FullscreenPass(gl);
    this.timer = new FrameTimer(gl, ext.timer);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    this.canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);

    this.observe();
    this.resize();

    this.loop = new RenderLoop(this.frame);
    this.loop.start();

    this.options.onReady?.(caps);
    return true;
  }

  private observe(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) this.loop?.setInView(entry.isIntersecting);
        },
        // A small negative margin means we stop rendering slightly before the
        // canvas is fully gone, and start slightly before it reappears.
        { rootMargin: '96px', threshold: 0 },
      );
      this.intersectionObserver.observe(this.canvas);
    }
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.cssWidth = Math.max(1, rect.width || this.canvas.clientWidth || 1);
    this.cssHeight = Math.max(1, rect.height || this.canvas.clientHeight || 1);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.options.maxDpr ?? 2);
    this.appliedScale = 0; // force the backbuffer to be re-sized next frame
  }

  private applyScale(scale: number): void {
    if (!this.bundle) return;
    if (Math.abs(scale - this.appliedScale) < 1e-4) return;
    const w = Math.max(1, Math.round(this.cssWidth * this.dpr * scale));
    const h = Math.max(1, Math.round(this.cssHeight * this.dpr * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.bundle.gl.viewport(0, 0, w, h);
    this.appliedScale = scale;
  }

  private readonly frame = (elapsed: number, delta: number, now: number) => {
    if (this.disposed || !this.bundle || !this.program || !this.pass || !this.timer) return;
    const { gl } = this.bundle;
    if (gl.isContextLost()) return;

    const stats = this.timer.snapshot(this.scaler.current, this.canvas.width, this.canvas.height);
    const scale = this.reducedMotion ? 1 : this.scaler.update(stats.frameMs || 16.7);
    this.applyScale(scale);

    this.timer.begin(now);

    this.program.use();
    this.program.set('uResolution', [this.canvas.width, this.canvas.height]);
    this.program.setAll(this.options.uniforms(elapsed, delta));
    this.pass.draw();

    this.timer.end(performance.now());

    // Reporting into Angular every frame would mean a change-detection pass at
    // 60Hz for a number nobody can read that fast. 6Hz is plenty for a HUD.
    if (this.options.onStats && ++this.statsTick >= 10) {
      this.statsTick = 0;
      this.options.onStats(
        this.timer.snapshot(scale, this.canvas.width, this.canvas.height),
      );
    }
  };

  /**
   * Explicit pause/resume. An IntersectionObserver cannot help a fixed-position
   * canvas — it is always "in view" — so the owner has to say when the canvas
   * has scrolled out of the composition and should stop burning frames.
   */
  setActive(active: boolean): void {
    this.loop?.setInView(active);
  }

  /** Recent frame times, oldest first. Returns the number of valid entries. */
  frameHistory(out: Float32Array): number {
    return this.timer?.history(out) ?? 0;
  }

  setQualityLock(scale: number | null): void {
    if (scale === null) this.scaler.unlock();
    else this.scaler.lock(scale);
  }

  private readonly onContextLost = (event: Event) => {
    // Without preventDefault the context is gone for good; with it, the browser
    // will fire contextrestored and we can rebuild.
    event.preventDefault();
    this.loop?.stop();
  };

  private readonly onContextRestored = () => {
    this.teardownGl();
    if (!this.disposed) this.init();
  };

  private teardownGl(): void {
    this.program?.dispose();
    this.pass?.dispose();
    this.timer?.dispose();
    this.program = null;
    this.pass = null;
    this.timer = null;
    this.loop?.stop();
    this.loop = null;
  }

  dispose(): void {
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.teardownGl();
    // Free the backbuffer immediately rather than waiting for GC to notice.
    this.bundle?.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.bundle = null;
  }
}

export type { FrameStats, GpuCapabilities };
