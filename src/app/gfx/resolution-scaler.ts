/**
 * Dynamic resolution scaling.
 *
 * Standard console-style DRS: watch the smoothed frame time against a budget
 * and move the internal render scale to keep it there. Two details matter —
 *
 *  1. Asymmetric response. Dropping resolution has to be fast (one bad frame is
 *     already visible), raising it has to be slow, or the scale oscillates
 *     around the budget and the shimmer is worse than the lower resolution.
 *  2. A cooldown after every change, so the measurement window contains frames
 *     rendered entirely at the new scale.
 */

export interface ScalerOptions {
  targetMs: number;
  minScale: number;
  maxScale: number;
  /** Scale is quantised to this step so the blit stays on tidy ratios. */
  step: number;
}

const DEFAULTS: ScalerOptions = {
  targetMs: 1000 / 60,
  minScale: 0.45,
  maxScale: 1,
  step: 0.05,
};

export class ResolutionScaler {
  private readonly opts: ScalerOptions;
  private scale: number;
  private smoothed = 0;
  private cooldown = 0;
  private locked = false;

  constructor(options: Partial<ScalerOptions> = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this.scale = this.opts.maxScale;
  }

  /** Pin the scale — used when the user drags the quality slider by hand. */
  lock(scale: number): void {
    this.locked = true;
    this.scale = this.clamp(scale);
  }

  unlock(): void {
    this.locked = false;
  }

  get isLocked(): boolean {
    return this.locked;
  }

  get current(): number {
    return this.scale;
  }

  private clamp(v: number): number {
    const { minScale, maxScale, step } = this.opts;
    const quantised = Math.round(v / step) * step;
    return Math.min(maxScale, Math.max(minScale, quantised));
  }

  update(frameMs: number): number {
    if (this.locked) return this.scale;

    // EMA over ~10 frames. Slow enough to ignore a single hitch (GC, a texture
    // upload) but fast enough to react inside a fifth of a second.
    this.smoothed = this.smoothed === 0 ? frameMs : this.smoothed * 0.9 + frameMs * 0.1;

    if (this.cooldown > 0) {
      this.cooldown--;
      return this.scale;
    }

    const { targetMs, step } = this.opts;
    const upperBound = targetMs * 1.15;
    const lowerBound = targetMs * 0.7;

    if (this.smoothed > upperBound) {
      // Overshoot proportionally: 2x over budget should not take 10 frames to fix.
      const overshoot = this.smoothed / targetMs;
      const drop = overshoot > 1.6 ? step * 3 : step;
      const next = this.clamp(this.scale - drop);
      if (next !== this.scale) {
        this.scale = next;
        this.cooldown = 8;
      }
    } else if (this.smoothed < lowerBound) {
      const next = this.clamp(this.scale + step);
      if (next !== this.scale) {
        this.scale = next;
        this.cooldown = 30; // climb back slowly
      }
    }
    return this.scale;
  }

  reset(): void {
    this.scale = this.opts.maxScale;
    this.smoothed = 0;
    this.cooldown = 0;
  }
}
