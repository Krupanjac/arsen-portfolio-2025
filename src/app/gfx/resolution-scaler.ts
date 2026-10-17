/**
 * Dynamic resolution scaling.
 *
 * Moves the internal render scale in 0.05 steps to keep each frame inside its
 * budget. Which signal it trusts depends on what the platform offers:
 *
 *  1. GPU time, from EXT_disjoint_timer_query_webgl2 when it returns real
 *     numbers. The pass gets 75% of the frame interval being defended; the
 *     rest belongs to compositing and the page. A few samples over budget in a
 *     row drop the scale, by as many steps as the overshoot calls for, and a
 *     long run under 55% of budget raises it one step. The band between the
 *     two is wider than one step's change in cost, so a raise cannot land
 *     over budget and bounce straight back.
 *  2. Dropped frames, everywhere else. The rAF interval says little about cost
 *     on its own: vsync pins it to the refresh interval however light the
 *     frame is, which is why "raise while the smoothed interval is under 70%
 *     of budget" can never fire on a 60 Hz display. A missed vsync is
 *     unmistakable, though. A few in a short window step down; a sustained
 *     clean run probes one step up, and a probe that brings drops back is
 *     reverted and the level above it held off for a while, longer each time
 *     it fails.
 *
 * Both paths keep the asymmetry this scaler was built on, drop fast and climb
 * slowly, and both ignore the frames right after a change, which pay for the
 * backbuffer reallocation rather than the new scale.
 *
 * The display interval comes from a low percentile of recent rAF intervals: a
 * frame can be late but never early, so the fast end of the distribution is
 * the vsync. That estimate cannot tell a 30 Hz cadence (a slow panel, or a
 * browser throttling to save power) from a 60 Hz display where every frame
 * misses. A cadence slower than the target is only believed once something
 * rules out our own cost: GPU time that would fit the target rate or, with no
 * timer, a short trip to the minimum scale that leaves the cadence unchanged.
 */

export interface ScalerOptions {
  /**
   * Interval of the frame rate worth defending, in ms (1000 / targetFps). A
   * faster display is budgeted at this rate rather than its own; a slower one
   * at its own, once the scaler is sure the slowness is the display's.
   */
  targetMs: number;
  minScale: number;
  maxScale: number;
  /** Scale is quantised to this step so the blit stays on tidy ratios. */
  step: number;
  /** Where adaptation starts: sharp enough to look intended, cheap enough for a weak GPU. */
  initialScale: number;
}

/** What is driving the scale right now; surfaced in the HUD stats. */
export type ScalerMode = 'locked' | 'warmup' | 'gpu' | 'frames';

const DEFAULTS: ScalerOptions = {
  targetMs: 1000 / 60,
  minScale: 0.45,
  maxScale: 1,
  step: 0.05,
  initialScale: 0.75,
};

/** Valid intervals seen before any decision. Startup frames are not representative. */
const WARMUP_FRAMES = 30;
/** Frames ignored after every change: they carry the reallocation, not the new scale. */
const SETTLE_FRAMES = 6;

/** Refresh estimate: 10th percentile of the last ~2 s of intervals at 60 Hz. */
const REFRESH_WINDOW = 120;
const REFRESH_PERCENTILE = 0.1;
const REFRESH_MIN_MS = 4;
const REFRESH_MAX_MS = 34;
/** A cadence this much slower than the target is suspect until explained. */
const SLOW_CADENCE = 1.3;

/** GPU path. Budget is a share of the defended interval; the rest are shares of the budget. */
const GPU_BUDGET = 0.75;
const GPU_RAISE = 0.55;
/** Where a drop aims to land the GPU time, so it is not straight back on the edge. */
const GPU_AIM = 0.8;
const GPU_DROP_SAMPLES = 4;
const GPU_RAISE_SAMPLES = 30;
/** No valid sample for this many frames means the timer is not usable: use dropped frames. */
const GPU_STALE_FRAMES = 30;
/** Anything outside (0, 1000) ms is a broken query, not a measurement. */
const GPU_MAX_MS = 1000;

/**
 * Dropped-frame path. A drop is an interval past the defended one by half a
 * vsync; the tolerance makes a frame exactly 1.5 vsyncs long count as late
 * rather than leaving it to float rounding (three 120 Hz vsyncs against a
 * 60 fps target, say).
 */
const DROP_SLACK = 0.5;
const DROP_TOLERANCE_MS = 0.5;
const DROPS_TO_FALL = 3;
const DROP_WINDOW_MS = 1000;
const PROBE_AFTER_MS = 2000;
/** Until the first drop the start scale is only a guess, so the first climb is quicker. */
const FIRST_PROBE_AFTER_MS = 500;
/** Right after a raise, fewer drops than usual are enough to take it back. */
const PROBATION_MS = 1500;
const PROBATION_DROPS = 2;
/**
 * A fall this soon after a raise, on either path, means the raise was a
 * mistake: the level is held off, and the hold doubles with each repeat until
 * a raise has lasted this long.
 */
const RAISE_MEMORY_MS = 4000;
const CEILING_HOLD_MS = 8000;
const CEILING_HOLD_MAX_MS = 64000;
/** Cadence test: frames sampled at the minimum scale, and the speed-up that proves the cost was ours. */
const CADENCE_TEST_FRAMES = 20;
const CADENCE_TEST_GAIN = 0.8;

export class ResolutionScaler {
  private readonly opts: ScalerOptions;
  private readonly minLevel: number;
  private readonly maxLevel: number;
  private readonly initialLevel: number;
  /** Scale in whole steps, so repeated changes never accumulate float error. */
  private level: number;
  private locked = false;

  // Observation. `clock` sums valid intervals: the scaler's own timeline,
  // which stands still while the loop is parked.
  private frame = 0;
  private clock = 0;
  private intervals = 0;
  private readonly ring = new Float32Array(REFRESH_WINDOW);
  private readonly sorted = new Float32Array(REFRESH_WINDOW);
  private ringCursor = 0;
  private ringFilled = 0;
  private refresh = Number.NaN;
  /** Median recent interval: what a frame usually takes, drops included. */
  private typical = Number.NaN;
  private slowCadenceIsDisplay = false;
  private lastGpuFrame = Number.NEGATIVE_INFINITY;
  private gpuAverage = Number.NaN;

  // Decisions.
  private warm = false;
  private settle = 0;
  private over = 0;
  private overSum = 0;
  private under = 0;
  private readonly drops = new Float64Array(DROPS_TO_FALL);
  private dropCursor = 0;
  private dropCount = 0;
  private everDropped = false;
  private runStart = 0;
  /** True while the last raise is on probation. */
  private probing = false;
  private probeUntil = 0;
  private probeDrops = 0;
  /** Level the last raise reached, remembered for RAISE_MEMORY_MS; -1 otherwise. */
  private raisedTo = -1;
  private raisedAt = 0;
  private ceiling = 0;
  private ceilingUntil = 0;
  private failures = 0;
  /** Level the cadence test will return to; -1 when no test is running. */
  private cadenceFrom = -1;
  private cadenceBaseline = 0;
  private cadenceSamples = 0;
  private cadenceFast = 0;

  constructor(options: Partial<ScalerOptions> = {}) {
    this.opts = { ...DEFAULTS, ...options };
    const { minScale, maxScale, step, initialScale } = this.opts;
    // Bounds round inward to the step grid; the epsilon absorbs 0.45 / 0.05 = 8.999….
    this.minLevel = Math.ceil(minScale / step - 1e-9);
    this.maxLevel = Math.max(this.minLevel, Math.floor(maxScale / step + 1e-9));
    this.initialLevel = this.toLevel(initialScale);
    this.level = this.initialLevel;
  }

  /** Pin the scale; used when the user picks a quality by hand. Overrides everything. */
  lock(scale: number): void {
    this.locked = true;
    this.level = this.toLevel(scale);
    this.probing = false;
    this.raisedTo = -1;
    this.cadenceFrom = -1;
  }

  /** Hand the scale back to adaptation, starting from wherever the lock left it. */
  unlock(): void {
    if (!this.locked) return;
    this.locked = false;
    // Nothing measured under the lock says anything about probes or ceilings.
    this.ceilingUntil = 0;
    this.failures = 0;
    this.resetDecisions();
  }

  get isLocked(): boolean {
    return this.locked;
  }

  get current(): number {
    // Rounded so the levels read as 0.75, not 0.7500000000000001.
    return Math.round(this.level * this.opts.step * 1e6) / 1e6;
  }

  /** Estimated display refresh interval in ms; NaN until enough frames are in. */
  get refreshMs(): number {
    return this.refresh;
  }

  get mode(): ScalerMode {
    if (this.locked) return 'locked';
    if (this.intervals < WARMUP_FRAMES) return 'warmup';
    return this.usingGpu ? 'gpu' : 'frames';
  }

  /**
   * Feed one frame and get the scale to render it at.
   *
   * @param intervalMs rAF interval that ended at this frame. NaN (or 0) after a
   *   pause, so the gap is not mistaken for a slow frame.
   * @param gpuMs GPU time of a timer query that resolved this frame, measured at
   *   the current scale. NaN when no such sample arrived.
   */
  update(intervalMs: number, gpuMs = Number.NaN): number {
    this.frame++;
    // Written as range checks so NaN fails them too.
    const hasInterval = intervalMs > 0 && intervalMs < Number.POSITIVE_INFINITY;
    const hasGpu = gpuMs > 0 && gpuMs < GPU_MAX_MS;
    if (hasInterval) this.observeInterval(intervalMs);
    if (hasGpu) {
      this.lastGpuFrame = this.frame;
      this.gpuAverage = Number.isNaN(this.gpuAverage) ? gpuMs : this.gpuAverage * 0.9 + gpuMs * 0.1;
    }

    if (this.locked || this.intervals < WARMUP_FRAMES) return this.current;
    if (!this.warm) {
      // Drops during the warm-up went unrecorded, so a clean run starts now.
      this.warm = true;
      this.runStart = this.clock;
    }
    if (this.settle > 0) {
      this.settle--;
      return this.current;
    }

    if (this.probing && this.clock >= this.probeUntil) this.probing = false;
    if (this.raisedTo >= 0 && this.clock - this.raisedAt >= RAISE_MEMORY_MS) {
      // The raise held up (any change since would have cleared it): it is the
      // new normal, and the backoff starts over.
      this.failures = 0;
      this.raisedTo = -1;
    }
    this.reviewCadence();

    if (this.usingGpu) {
      // A cadence test only makes sense without a timer.
      this.cadenceFrom = -1;
      if (hasGpu) this.fromGpu(gpuMs);
    } else if (hasInterval) {
      this.fromDrops(intervalMs);
    }
    return this.current;
  }

  /** Back to the initial scale, forgetting everything measured so far. */
  reset(): void {
    this.level = this.initialLevel;
    this.frame = 0;
    this.clock = 0;
    this.intervals = 0;
    this.warm = false;
    this.clearRing();
    this.slowCadenceIsDisplay = false;
    this.lastGpuFrame = Number.NEGATIVE_INFINITY;
    this.ceilingUntil = 0;
    this.failures = 0;
    this.everDropped = false;
    this.resetDecisions();
  }

  private get usingGpu(): boolean {
    return this.frame - this.lastGpuFrame <= GPU_STALE_FRAMES;
  }

  private get slowCadence(): boolean {
    return this.refresh > this.opts.targetMs * SLOW_CADENCE;
  }

  /** The frame interval being defended, in ms. */
  private get defendedMs(): number {
    const { targetMs } = this.opts;
    if (!(this.refresh > targetMs)) return targetMs;
    return !this.slowCadence || this.slowCadenceIsDisplay ? this.refresh : targetMs;
  }

  private toLevel(scale: number): number {
    const level = Math.round(scale / this.opts.step);
    return Math.min(this.maxLevel, Math.max(this.minLevel, level));
  }

  private observeInterval(ms: number): void {
    this.clock += ms;
    this.intervals++;
    this.ring[this.ringCursor] = ms;
    this.ringCursor = (this.ringCursor + 1) % REFRESH_WINDOW;
    if (this.ringFilled < REFRESH_WINDOW) this.ringFilled++;
    // Every 8 frames is plenty: displays rarely change rate.
    if (this.ringFilled >= 8 && this.intervals % 8 === 0) this.estimateRefresh();
  }

  private estimateRefresh(): void {
    const n = this.ringFilled;
    const view = this.sorted.subarray(0, n);
    view.set(this.ring.subarray(0, n));
    view.sort();
    const low = view[Math.floor(REFRESH_PERCENTILE * (n - 1))];
    this.refresh = Math.min(REFRESH_MAX_MS, Math.max(REFRESH_MIN_MS, low));
    this.typical = view[Math.floor(0.5 * (n - 1))];
  }

  private clearRing(): void {
    this.ringCursor = 0;
    this.ringFilled = 0;
    this.refresh = Number.NaN;
    this.typical = Number.NaN;
  }

  /** Decides whether a slow cadence is the display's (believed) or ours (fought). */
  private reviewCadence(): void {
    if (!this.slowCadence) {
      this.slowCadenceIsDisplay = false;
      return;
    }
    // Our pass alone would fit the target rate, so the slowness is not ours.
    if (this.usingGpu && this.gpuAverage < GPU_BUDGET * this.opts.targetMs) {
      this.slowCadenceIsDisplay = true;
    }
  }

  private fromGpu(gpuMs: number): void {
    const budget = GPU_BUDGET * this.defendedMs;
    if (gpuMs > budget) {
      this.under = 0;
      this.overSum += gpuMs;
      if (++this.over < GPU_DROP_SAMPLES) return;
      // Fragment cost follows pixel count, i.e. scale squared: size the drop to
      // land inside the band in one move instead of walking down a step at a
      // time while every frame is late.
      const average = this.overSum / this.over;
      const want = this.current * Math.sqrt((GPU_AIM * budget) / average);
      this.fall(Math.max(1, this.level - Math.round(want / this.opts.step)));
      return;
    }
    this.over = 0;
    this.overSum = 0;
    if (gpuMs < GPU_RAISE * budget) {
      if (++this.under >= GPU_RAISE_SAMPLES) this.rise();
    } else {
      this.under = 0;
    }
  }

  private fromDrops(intervalMs: number): void {
    if (this.cadenceFrom >= 0) {
      this.continueCadenceTest(intervalMs);
      return;
    }
    if (this.slowCadence && !this.slowCadenceIsDisplay) {
      this.startCadenceTest();
      return;
    }

    const defended = this.defendedMs;
    // Written so an unknown refresh (NaN) falls back to the defended interval.
    const vsync = this.refresh < defended ? this.refresh : defended;
    if (intervalMs > defended + DROP_SLACK * vsync - DROP_TOLERANCE_MS) {
      this.everDropped = true;
      this.runStart = this.clock;
      if (this.probing && ++this.probeDrops >= PROBATION_DROPS) {
        this.fall(1);
        return;
      }
      this.drops[this.dropCursor] = this.clock;
      this.dropCursor = (this.dropCursor + 1) % DROPS_TO_FALL;
      if (this.dropCount < DROPS_TO_FALL) this.dropCount++;
      // drops[dropCursor] is now the oldest of the last DROPS_TO_FALL.
      if (this.dropCount === DROPS_TO_FALL && this.clock - this.drops[this.dropCursor] <= DROP_WINDOW_MS) {
        this.fall(1);
      }
      return;
    }

    const quiet = this.everDropped ? PROBE_AFTER_MS : FIRST_PROBE_AFTER_MS;
    if (this.clock - this.runStart >= quiet) this.rise();
  }

  private startCadenceTest(): void {
    if (this.level <= this.minLevel) {
      // Nothing cheaper to try. Whatever the cause, this is the cadence we get.
      this.slowCadenceIsDisplay = true;
      return;
    }
    const from = this.level;
    this.setLevel(this.minLevel);
    this.cadenceFrom = from;
    // The typical interval, not the clamped estimate: a pass slow enough to
    // run at 20 fps should still count as faster when it reaches 30.
    this.cadenceBaseline = this.typical;
    this.cadenceSamples = 0;
    this.cadenceFast = 0;
  }

  private continueCadenceTest(intervalMs: number): void {
    if (intervalMs < CADENCE_TEST_GAIN * this.cadenceBaseline) this.cadenceFast++;
    if (++this.cadenceSamples < CADENCE_TEST_FRAMES) return;
    const from = this.cadenceFrom;
    this.cadenceFrom = -1;
    if (this.cadenceFast * 2 >= this.cadenceSamples) {
      // The slow cadence was our own cost. Measure the display afresh at the
      // new pace, and climb back from the floor through ordinary probes.
      this.everDropped = true;
      this.clearRing();
    } else {
      this.slowCadenceIsDisplay = true;
      this.setLevel(from);
    }
  }

  /** Steps down; a fall soon after a raise reverts it and holds that level off. */
  private fall(levels: number): void {
    let next = this.level - levels;
    if (this.raisedTo >= 0 && this.level === this.raisedTo) {
      const below = this.level - 1;
      next = Math.min(next, below);
      this.ceiling = below;
      this.ceilingUntil =
        this.clock + Math.min(CEILING_HOLD_MS * 2 ** this.failures, CEILING_HOLD_MAX_MS);
      this.failures++;
    }
    this.setLevel(next);
  }

  private rise(): void {
    const cap = this.clock < this.ceilingUntil ? this.ceiling : this.maxLevel;
    if (this.level >= cap) return;
    this.setLevel(this.level + 1);
    this.probing = true;
    this.probeUntil = this.clock + PROBATION_MS;
    this.probeDrops = 0;
    this.raisedTo = this.level;
    this.raisedAt = this.clock;
  }

  private setLevel(level: number): void {
    const next = Math.min(this.maxLevel, Math.max(this.minLevel, level));
    if (next === this.level) return;
    this.level = next;
    this.resetDecisions();
  }

  private resetDecisions(): void {
    this.settle = SETTLE_FRAMES;
    this.over = 0;
    this.overSum = 0;
    this.under = 0;
    this.dropCount = 0;
    this.runStart = this.clock;
    this.probing = false;
    this.raisedTo = -1;
    this.cadenceFrom = -1;
    this.gpuAverage = Number.NaN;
  }
}
