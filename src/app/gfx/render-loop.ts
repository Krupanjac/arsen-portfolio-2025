/**
 * requestAnimationFrame driver.
 *
 * Owns the things every canvas on the page needs and nobody wants to write
 * twice: pausing when scrolled out of view, pausing when the tab is hidden,
 * honouring prefers-reduced-motion, and never letting a resumed loop see a
 * multi-second delta.
 *
 * Three independent reasons can stop it, each with its own flag so that one
 * source can never overrule another: the owner parked it (setActive), it is
 * occluded (setInView, from an IntersectionObserver), or the document is
 * hidden. It runs only while none of them objects.
 */

/**
 * `resumed` is true on the first frame after a start or a pause; `deltaSeconds`
 * is 0 on that frame, and on every frame while the clock is frozen.
 */
export type FrameCallback = (
  elapsedSeconds: number,
  deltaSeconds: number,
  now: number,
  resumed: boolean,
) => void;

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export class RenderLoop {
  private handle = 0;
  private running = false;
  private active = true;
  private inView = true;
  private visible = true;
  private clockFrozen = false;
  private resumed = true;
  private lastNow = 0;
  private elapsed = 0;

  private readonly onVisibility = () => {
    this.visible = document.visibilityState === 'visible';
    this.sync();
  };

  constructor(private readonly callback: FrameCallback) {}

  /** The owner's intent: false parks the loop whatever the observers say. */
  setActive(active: boolean): void {
    this.active = active;
    this.sync();
  }

  /** Occlusion, driven by an IntersectionObserver owned by the caller. */
  setInView(inView: boolean): void {
    this.inView = inView;
    this.sync();
  }

  /**
   * Stops the animation clock without stopping the frames: elapsed holds and
   * delta reads 0. Used under reduced motion, where frames still run to pick
   * up changes but nothing should move on its own.
   */
  setClockFrozen(frozen: boolean): void {
    this.clockFrozen = frozen;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    this.visible = document.visibilityState === 'visible';
    this.sync();
  }

  stop(): void {
    this.running = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.cancel();
  }

  get isRunning(): boolean {
    return this.running && this.active && this.inView && this.visible;
  }

  private sync(): void {
    if (this.isRunning) {
      if (!this.handle) {
        this.resumed = true; // force a zero-delta frame on resume
        this.handle = requestAnimationFrame(this.tick);
      }
    } else {
      this.cancel();
    }
  }

  private cancel(): void {
    if (this.handle) {
      cancelAnimationFrame(this.handle);
      this.handle = 0;
    }
  }

  private readonly tick = (now: number) => {
    this.handle = requestAnimationFrame(this.tick);
    const resumed = this.resumed;
    this.resumed = false;
    // First frame after a resume: report no elapsed time rather than the gap.
    const delta = resumed || this.clockFrozen ? 0 : Math.max(0, (now - this.lastNow) / 1000);
    this.lastNow = now;
    // Clamp so a long hitch does not teleport an animation forward.
    this.elapsed += Math.min(delta, 1 / 15);
    this.callback(this.elapsed, delta, now, resumed);
  };
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
