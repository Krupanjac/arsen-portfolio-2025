/**
 * Frame timing.
 *
 * CPU time is measured around the submit; GPU time comes from
 * EXT_disjoint_timer_query_webgl2 when available. Timer queries resolve
 * asynchronously — typically 1-3 frames behind — so we keep a small pool of
 * in-flight queries and poll them rather than stalling on getQueryParameter.
 */

const RING = 120; // ~2s of history at 60Hz
const MAX_INFLIGHT = 4;

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
  worstMs: number;
  /** Current internal render scale, 1 = native. */
  renderScale: number;
  /** Backbuffer dimensions actually rasterised. */
  width: number;
  height: number;
  /** Rays / fragments shaded per second, derived. */
  pixelsPerSecond: number;
  frameIndex: number;
}

export class FrameTimer {
  private readonly frames = new Float32Array(RING);
  private readonly sorted = new Float32Array(RING);
  private cursor = 0;
  private filled = 0;

  private lastPresent = 0;
  private cpuStart = 0;
  private cpuAccum = 0;

  private readonly inflight: Array<{ query: WebGLQuery; frame: number }> = [];
  private lastGpuMs = Number.NaN;
  private frameIndex = 0;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly timerExt: any | null,
  ) {}

  /** Call immediately before issuing draw calls for the frame. */
  begin(now: number): void {
    this.cpuStart = now;
    if (this.lastPresent > 0) {
      const dt = now - this.lastPresent;
      // Clamp: a backgrounded tab or a breakpoint would otherwise poison the ring.
      this.frames[this.cursor] = Math.min(dt, 200);
      this.cursor = (this.cursor + 1) % RING;
      this.filled = Math.min(this.filled + 1, RING);
    }
    this.lastPresent = now;

    if (this.timerExt && this.inflight.length < MAX_INFLIGHT) {
      const query = this.gl.createQuery();
      if (query) {
        this.gl.beginQuery(this.timerExt.TIME_ELAPSED_EXT, query);
        this.inflight.push({ query, frame: this.frameIndex });
      }
    }
  }

  /** Call immediately after the last draw call for the frame. */
  end(now: number): void {
    this.cpuAccum = now - this.cpuStart;
    if (this.timerExt && this.inflight.length > 0) {
      const newest = this.inflight[this.inflight.length - 1];
      if (newest.frame === this.frameIndex) {
        this.gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
      }
    }
    this.pollQueries();
    this.frameIndex++;
  }

  private pollQueries(): void {
    const gl = this.gl;
    if (!this.timerExt) return;
    // A GPU reset or a power-state change sets the disjoint flag; every
    // outstanding result is then meaningless and must be thrown away.
    const disjoint = gl.getParameter(this.timerExt.GPU_DISJOINT_EXT);
    while (this.inflight.length > 0) {
      const oldest = this.inflight[0];
      if (oldest.frame === this.frameIndex) break; // still recording
      const available = gl.getQueryParameter(oldest.query, gl.QUERY_RESULT_AVAILABLE);
      if (!available) break;
      if (!disjoint) {
        const ns = gl.getQueryParameter(oldest.query, gl.QUERY_RESULT) as number;
        this.lastGpuMs = ns / 1e6;
      }
      gl.deleteQuery(oldest.query);
      this.inflight.shift();
    }
    if (disjoint) {
      for (const q of this.inflight) gl.deleteQuery(q.query);
      this.inflight.length = 0;
      this.lastGpuMs = Number.NaN;
    }
  }

  private percentile(p: number): number {
    if (this.filled === 0) return 0;
    const view = this.sorted.subarray(0, this.filled);
    view.set(this.frames.subarray(0, this.filled));
    view.sort();
    const idx = Math.min(this.filled - 1, Math.floor(p * this.filled));
    return view[idx];
  }

  snapshot(renderScale: number, width: number, height: number): FrameStats {
    const frameMs = this.filled > 0 ? this.frames[(this.cursor + RING - 1) % RING] : 0;
    return {
      frameMs,
      cpuMs: this.cpuAccum,
      gpuMs: this.lastGpuMs,
      fps: frameMs > 0 ? 1000 / frameMs : 0,
      p95Ms: this.percentile(0.95),
      worstMs: this.percentile(0.999),
      renderScale,
      width,
      height,
      pixelsPerSecond: frameMs > 0 ? (width * height * 1000) / frameMs : 0,
      frameIndex: this.frameIndex,
    };
  }

  /** Recent frame times, oldest first — for the HUD sparkline. */
  history(out: Float32Array): number {
    const n = this.filled;
    for (let i = 0; i < n; i++) {
      out[i] = this.frames[(this.cursor + RING - n + i) % RING];
    }
    return n;
  }

  dispose(): void {
    for (const q of this.inflight) this.gl.deleteQuery(q.query);
    this.inflight.length = 0;
  }
}
