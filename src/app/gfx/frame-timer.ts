/**
 * Frame timing.
 *
 * Three clocks, kept apart because they answer different questions: the
 * interval between presented frames (what the viewer sees), CPU time in our own
 * submit path, and GPU time for the pass from EXT_disjoint_timer_query_webgl2
 * when available. Timer queries resolve asynchronously — typically 1-3 frames
 * behind — so we keep a small pool of in-flight queries and poll them rather
 * than stalling on getQueryParameter.
 *
 * Each query carries a tag from the caller (the surface passes its backbuffer
 * generation), so a late sample can be matched to the configuration that
 * produced it: a frame rendered before a resize says nothing about the frames
 * after it.
 */

import type { ScalerMode } from './resolution-scaler';

const RING = 120; // ~2s of history at 60Hz
const MAX_INFLIGHT = 4;
/** Clamp: a backgrounded tab or a breakpoint would otherwise poison the ring. */
const MAX_INTERVAL_MS = 200;

export interface FrameStats {
  /** Wall time between the last two presented frames, in ms. */
  frameMs: number;
  /** Time spent in our own JS submit path, in ms. */
  cpuMs: number;
  /** GPU execution time for the pass, in ms. NaN when unsupported. */
  gpuMs: number;
  fps: number;
  /** 95th percentile frame time over the ring buffer — the number that matters. */
  p95Ms: number;
  /** Slowest frame in the ring buffer. */
  worstMs: number;
  /** Current internal render scale, 1 = native. */
  renderScale: number;
  /** Backbuffer dimensions actually rasterised. */
  width: number;
  height: number;
  /** Rays / fragments shaded per second, derived. */
  pixelsPerSecond: number;
  frameIndex: number;
  /** Estimated display refresh interval in ms, NaN until measured. Set by ShaderSurface. */
  refreshMs?: number;
  /**
   * What is driving the render scale: GPU time, dropped frames, a manual lock,
   * the warm-up, or 'still' when reduced motion renders on demand. Set by
   * ShaderSurface.
   */
  scalerMode?: ScalerMode | 'still';
}

interface PendingQuery {
  query: WebGLQuery;
  tag: number;
}

export class FrameTimer {
  private readonly frames = new Float32Array(RING);
  private readonly sorted = new Float32Array(RING);
  private cursor = 0;
  private filled = 0;

  private lastPresent = Number.NaN;
  private cpuStart = 0;
  private cpuMs = 0;

  private readonly inflight: PendingQuery[] = [];
  /** Query objects whose results have been read, kept for reuse. */
  private readonly spare: WebGLQuery[] = [];
  private recording: PendingQuery | null = null;
  private lastGpuMs = Number.NaN;
  private lastGpuTag = Number.NaN;
  private gpuFresh = false;
  private frameIndex = 0;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly timerExt: any | null,
  ) {}

  /** The timer extension exists. Whether it returns usable numbers is another matter. */
  get gpuSupported(): boolean {
    return !!this.timerExt;
  }

  /**
   * Records the presentation interval ending at `now` (a rAF timestamp) and
   * returns it in ms. NaN for the first frame, and for the first after
   * markDiscontinuity(): there is no honest interval to report across a pause.
   */
  tick(now: number): number {
    const previous = this.lastPresent;
    this.lastPresent = now;
    // Written so a NaN `previous` fails the check too.
    if (!(now > previous)) return Number.NaN;
    const dt = Math.min(now - previous, MAX_INTERVAL_MS);
    this.frames[this.cursor] = dt;
    this.cursor = (this.cursor + 1) % RING;
    if (this.filled < RING) this.filled++;
    return dt;
  }

  /** The next tick() starts measuring afresh instead of spanning a pause. */
  markDiscontinuity(): void {
    this.lastPresent = Number.NaN;
  }

  /** Call immediately before issuing draw calls for the frame; `tag` labels its GPU sample. */
  begin(tag = 0): void {
    this.cpuStart = performance.now();
    if (!this.timerExt || this.recording || this.inflight.length >= MAX_INFLIGHT) return;
    const query = this.spare.pop() ?? this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.timerExt.TIME_ELAPSED_EXT, query);
    this.recording = { query, tag };
  }

  /** Call immediately after the last draw call for the frame. */
  end(): void {
    this.cpuMs = performance.now() - this.cpuStart;
    if (this.recording) {
      this.gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
      this.inflight.push(this.recording);
      this.recording = null;
    }
    this.poll();
    this.frameIndex++;
  }

  /**
   * Collects finished queries without blocking; true when a new GPU sample
   * arrived. Makes no GL calls when nothing is in flight, so it is cheap to
   * call on frames that draw nothing.
   */
  poll(): boolean {
    if (!this.timerExt || this.inflight.length === 0) return false;
    const gl = this.gl;
    // A GPU reset or a power-state change sets the disjoint flag; every
    // outstanding result is then meaningless and must be thrown away.
    if (gl.getParameter(this.timerExt.GPU_DISJOINT_EXT)) {
      for (const pending of this.inflight) gl.deleteQuery(pending.query);
      this.inflight.length = 0;
      this.lastGpuMs = Number.NaN;
      this.gpuFresh = false;
      return false;
    }
    let fresh = false;
    while (this.inflight.length > 0) {
      const oldest = this.inflight[0];
      if (!gl.getQueryParameter(oldest.query, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(oldest.query, gl.QUERY_RESULT) as number;
      this.lastGpuMs = ns / 1e6;
      this.lastGpuTag = oldest.tag;
      this.inflight.shift();
      this.spare.push(oldest.query);
      fresh = true;
    }
    if (fresh) this.gpuFresh = true;
    return fresh;
  }

  /**
   * GPU time of the newest sample resolved since the last call, when it was
   * recorded under `tag`; NaN otherwise. Each sample is handed out once.
   */
  takeGpuMs(tag: number): number {
    if (!this.gpuFresh) return Number.NaN;
    this.gpuFresh = false;
    return this.lastGpuTag === tag ? this.lastGpuMs : Number.NaN;
  }

  snapshot(renderScale: number, width: number, height: number): FrameStats {
    const n = this.filled;
    const frameMs = n > 0 ? this.frames[(this.cursor + RING - 1) % RING] : 0;
    let p95Ms = 0;
    let worstMs = 0;
    if (n > 0) {
      // One sort serves both numbers, and only when somebody asks: this runs
      // at the HUD's rate, not every frame.
      const view = this.sorted.subarray(0, n);
      view.set(this.frames.subarray(0, n));
      view.sort();
      // Nearest rank: the smallest frame time that 95% of frames do not exceed.
      p95Ms = view[Math.max(0, Math.ceil((95 * n) / 100) - 1)];
      worstMs = view[n - 1];
    }
    return {
      frameMs,
      cpuMs: this.cpuMs,
      gpuMs: this.lastGpuMs,
      fps: frameMs > 0 ? 1000 / frameMs : 0,
      p95Ms,
      worstMs,
      renderScale,
      width,
      height,
      pixelsPerSecond: frameMs > 0 ? (width * height * 1000) / frameMs : 0,
      frameIndex: this.frameIndex,
    };
  }

  /** The most recent frame times that fit in `out`, oldest first — for the HUD sparkline. */
  history(out: Float32Array): number {
    const n = Math.min(this.filled, out.length);
    for (let i = 0; i < n; i++) {
      out[i] = this.frames[(this.cursor + RING - n + i) % RING];
    }
    return n;
  }

  dispose(): void {
    const gl = this.gl;
    if (this.recording) gl.deleteQuery(this.recording.query);
    for (const pending of this.inflight) gl.deleteQuery(pending.query);
    for (const query of this.spare) gl.deleteQuery(query);
    this.recording = null;
    this.inflight.length = 0;
    this.spare.length = 0;
  }
}
