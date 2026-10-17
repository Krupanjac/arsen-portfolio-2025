/**
 * A single full-canvas fragment-shader pass with dynamic resolution, honest
 * frame timing, and the lifecycle plumbing a long-lived canvas on a scrolling
 * page needs (context loss, resize, occlusion, tab visibility, reduced motion).
 *
 * Framework-agnostic on purpose — the Angular component around it only wires
 * inputs and outputs.
 */

import { createGlBundle, prettyRenderer, type GlBundle, type GpuCapabilities } from './gl-context';
import { FULLSCREEN_VERTEX_SHADER, FullscreenPass } from './fullscreen-pass';
import { FrameTimer, type FrameStats } from './frame-timer';
import { REDUCED_MOTION_QUERY, RenderLoop, prefersReducedMotion } from './render-loop';
import { ResolutionScaler } from './resolution-scaler';
import { ShaderProgram, ShaderCompileError, UniformSnapshot, type UniformValue } from './shader';
import { GLSL_COMMON } from './shaders/common.glsl';

export interface ShaderSurfaceOptions {
  fragmentSource: string;
  /**
   * Called every animation frame; return the uniforms for that frame. While
   * the surface is still (reduced motion, or setStill(true)) the clock is
   * frozen (elapsed holds, delta is 0) and a frame is only drawn when the
   * values returned differ from the last frame drawn.
   */
  uniforms: (elapsed: number, delta: number) => Record<string, UniformValue>;
  onStats?: (stats: FrameStats) => void;
  onError?: (error: Error) => void;
  onReady?: (caps: GpuCapabilities) => void;
  /** Frame rate the resolution scaler defends; faster displays are not chased past it. Default 60. */
  targetFps?: number;
  /** Upper bound on device pixel ratio. 2 is plenty for a shader this heavy. */
  maxDpr?: number;
  /** GPU selection hint (see GlContextOptions). Default 'default'. */
  powerPreference?: WebGLPowerPreference;
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

/**
 * Stats go out every 10th drawn frame (~6Hz at 60fps), or after 250ms, so a
 * slow surface, or one drawing on demand, still reports promptly.
 */
const STATS_EVERY_FRAMES = 10;
const STATS_EVERY_MS = 250;

export class ShaderSurface {
  private bundle: GlBundle | null = null;
  private program: ShaderProgram | null = null;
  private pass: FullscreenPass | null = null;
  private timer: FrameTimer | null = null;
  private loop: RenderLoop | null = null;
  private readonly scaler: ResolutionScaler;
  private readonly drawn = new UniformSnapshot();

  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private motionQuery: MediaQueryList | null = null;

  private cssWidth = 1;
  private cssHeight = 1;
  private dpr = 1;
  private appliedScale = 0;
  /** Bumped whenever the backbuffer changes size; GPU samples from before it are stale. */
  private generation = 0;
  /** The owner's setActive(); kept here so a context restore cannot undo a park. */
  private active = true;
  /** The owner's setStill(); null follows the system's prefers-reduced-motion. */
  private stillOverride: boolean | null = null;
  /** prefers-reduced-motion, kept current by a listener. */
  private systemStill: boolean;
  /** Frames are drawn on demand with the clock held, not continuously. */
  private still: boolean;
  /** The next frame must draw: first frame, resize, context restore, lock or mode change. */
  private dirty = true;
  private drewLastFrame = false;
  private framesSinceStats = 0;
  private lastStatsAt = Number.NEGATIVE_INFINITY;
  private started = false;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: ShaderSurfaceOptions,
  ) {
    this.systemStill = prefersReducedMotion();
    this.still = this.systemStill;
    this.scaler = new ResolutionScaler({ targetMs: 1000 / (options.targetFps ?? 60) });
  }

  /** True while the surface holds its picture and draws on demand. */
  get isStill(): boolean {
    return this.still;
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

  /**
   * Acquires the context and starts the loop. False (after onError) when
   * WebGL2 is missing or the shader fails to compile. Once started, calling it
   * again changes nothing.
   */
  init(): boolean {
    if (this.disposed) return false;
    if (this.started) return true;
    const caps = this.initGl();
    if (!caps) return false;
    this.started = true;

    // Everything below is set up exactly once. A context restore only rebuilds
    // what lived inside the context (initGl).
    this.canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);
    this.observe();
    this.resize();

    this.loop = new RenderLoop(this.frame);
    this.loop.setActive(this.active);
    this.loop.setClockFrozen(this.still);
    this.loop.start();

    this.options.onReady?.(caps);
    return true;
  }

  /** Builds what lives inside the GL context. Runs again after a context restore. */
  private initGl(): GpuCapabilities | null {
    const bundle = createGlBundle(this.canvas, { powerPreference: this.options.powerPreference });
    if (!bundle) {
      this.options.onError?.(new Error('WebGL2 is not available in this browser.'));
      return null;
    }
    this.bundle = bundle;
    const { gl, ext } = bundle;

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
      return null;
    }

    this.pass = new FullscreenPass(gl);
    this.timer = new FrameTimer(gl, ext.timer);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    // A fresh context has a default viewport and nothing on screen.
    this.appliedScale = 0;
    this.dirty = true;
    return bundle.caps;
  }

  private observe(): void {
    this.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          // Entries arrive oldest first; the last one is the current state.
          const latest = entries[entries.length - 1];
          if (latest) this.loop?.setInView(latest.isIntersecting);
        },
        // A positive margin starts rendering just before the canvas scrolls
        // into view and stops just after it has gone.
        { rootMargin: '96px', threshold: 0 },
      );
      this.intersectionObserver.observe(this.canvas);
    }
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const query = window.matchMedia(REDUCED_MOTION_QUERY);
      // Safari before 14 only has the deprecated listener API.
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', this.onMotionChange);
      } else {
        query.addListener(this.onMotionChange);
      }
      this.motionQuery = query;
    }
  }

  private disconnect(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    const query = this.motionQuery;
    if (query) {
      if (typeof query.removeEventListener === 'function') {
        query.removeEventListener('change', this.onMotionChange);
      } else {
        query.removeListener(this.onMotionChange);
      }
      this.motionQuery = null;
    }
  }

  private readonly onMotionChange = (event: MediaQueryListEvent): void => {
    this.systemStill = event.matches;
    this.applyStill();
  };

  private applyStill(): void {
    const still = this.stillOverride ?? this.systemStill;
    if (still === this.still) return;
    this.still = still;
    this.loop?.setClockFrozen(still);
    this.dirty = true;
    // Whatever was measured before the switch says nothing about the next frame.
    this.drewLastFrame = false;
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.cssWidth = Math.max(1, rect.width || this.canvas.clientWidth || 1);
    this.cssHeight = Math.max(1, rect.height || this.canvas.clientHeight || 1);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.options.maxDpr ?? 2);
    this.appliedScale = 0; // force the backbuffer to be re-sized next frame
    this.dirty = true;
  }

  private applyScale(scale: number): void {
    if (!this.bundle) return;
    if (Math.abs(scale - this.appliedScale) < 1e-4) return;
    const w = Math.max(1, Math.round(this.cssWidth * this.dpr * scale));
    const h = Math.max(1, Math.round(this.cssHeight * this.dpr * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.generation++;
    }
    this.bundle.gl.viewport(0, 0, w, h);
    this.appliedScale = scale;
  }

  private readonly frame = (elapsed: number, delta: number, now: number, resumed: boolean) => {
    // An interval only means something between two frames drawn back to back.
    const consecutive = this.drewLastFrame && !resumed;
    this.drewLastFrame = false;
    const { bundle, program, pass, timer } = this;
    if (this.disposed || !bundle || !program || !pass || !timer) return;
    if (bundle.gl.isContextLost()) return;

    const uniforms = this.options.uniforms(elapsed, delta);
    let scale: number;
    if (this.still) {
      // Still: nothing moves by itself, so a frame is only worth drawing when
      // its inputs changed (a theme switch, say). Skipped frames issue no draw
      // and no timer query.
      if (!this.dirty && this.drawn.matches(uniforms)) {
        // The last still frame's GPU time may have just come in.
        if (timer.poll()) this.report(now);
        return;
      }
      if (!consecutive) timer.markDiscontinuity();
      timer.tick(now);
      // A still frame has no budget to defend: full resolution, unless the
      // owner pinned a scale.
      scale = this.scaler.isLocked ? this.scaler.current : 1;
    } else {
      if (!consecutive) timer.markDiscontinuity();
      const intervalMs = timer.tick(now);
      scale = this.scaler.update(intervalMs, timer.takeGpuMs(this.generation));
    }
    this.applyScale(scale);

    timer.begin(this.generation);

    program.use();
    program.set('uResolution', [this.canvas.width, this.canvas.height]);
    program.setAll(uniforms);
    pass.draw();

    timer.end();

    if (this.still) this.drawn.capture(uniforms);
    this.dirty = false;
    this.drewLastFrame = true;

    // Reporting into Angular every frame would mean a change-detection pass at
    // 60Hz for a number nobody can read that fast. 6Hz is plenty for a HUD.
    if (++this.framesSinceStats >= STATS_EVERY_FRAMES || now - this.lastStatsAt >= STATS_EVERY_MS) {
      this.report(now);
    }
  };

  private report(now: number): void {
    if (!this.options.onStats || !this.timer) return;
    this.framesSinceStats = 0;
    this.lastStatsAt = now;
    const stats = this.timer.snapshot(this.appliedScale, this.canvas.width, this.canvas.height);
    stats.refreshMs = this.scaler.refreshMs;
    stats.scalerMode = this.still ? 'still' : this.scaler.mode;
    this.options.onStats(stats);
  }

  /**
   * Explicit pause/resume. An IntersectionObserver cannot help a fixed-position
   * canvas — it is always "in view" — so the owner has to say when the canvas
   * has scrolled out of the composition and should stop burning frames. The
   * observer can never overrule this: the loop runs only while both agree.
   */
  setActive(active: boolean): void {
    this.active = active;
    this.loop?.setActive(active);
  }

  /**
   * Holds the picture (true) or animates (false) whatever the system prefers;
   * null, the default, follows prefers-reduced-motion. A held surface keeps
   * its clock where it stopped and draws only when its uniforms change, so
   * letting go carries on from the same frame. Safe to call before init().
   */
  setStill(still: boolean | null): void {
    this.stillOverride = still;
    this.applyStill();
  }

  /** Recent frame times, oldest first. Returns the number of valid entries. */
  frameHistory(out: Float32Array): number {
    return this.timer?.history(out) ?? 0;
  }

  setQualityLock(scale: number | null): void {
    if (scale === null) this.scaler.unlock();
    else this.scaler.lock(scale);
    // A still surface has to redraw to show the new scale.
    this.dirty = true;
  }

  private readonly onContextLost = (event: Event) => {
    // Without preventDefault the context is gone for good; with it, the browser
    // will fire contextrestored and we can rebuild.
    event.preventDefault();
    this.loop?.stop();
    // Everything the old context owned died with it; there is nothing to delete.
    this.program = null;
    this.pass = null;
    this.timer = null;
  };

  private readonly onContextRestored = () => {
    if (this.disposed) return;
    // Listeners and observers are still attached, and the loop keeps its
    // flags and clock: rebuild the GL side and carry on, parked or not.
    const caps = this.initGl();
    if (!caps) return;
    this.loop?.start();
    this.options.onReady?.(caps);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop?.stop();
    this.loop = null;
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.disconnect();
    if (this.bundle && !this.bundle.gl.isContextLost()) {
      this.program?.dispose();
      this.pass?.dispose();
      this.timer?.dispose();
    }
    this.program = null;
    this.pass = null;
    this.timer = null;
    // Free the backbuffer immediately rather than waiting for GC to notice.
    this.bundle?.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.bundle = null;
  }
}

export type { FrameStats, GpuCapabilities };
