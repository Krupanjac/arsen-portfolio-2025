/**
 * requestAnimationFrame driver.
 *
 * Owns the things every canvas on the page needs and nobody wants to write
 * twice: pausing when scrolled out of view, pausing when the tab is hidden,
 * honouring prefers-reduced-motion, and never letting a resumed loop see a
 * multi-second delta.
 */

export type FrameCallback = (elapsedSeconds: number, deltaSeconds: number, now: number) => void;

export class RenderLoop {
  private handle = 0;
  private running = false;
  private visible = true;
  private inView = true;
  private startTime = 0;
  private lastNow = 0;
  private elapsed = 0;

  private readonly onVisibility = () => {
    this.visible = document.visibilityState === 'visible';
    this.sync();
  };

  constructor(private readonly callback: FrameCallback) {}

  /** Drives inView from an IntersectionObserver owned by the caller. */
  setInView(inView: boolean): void {
    this.inView = inView;
    this.sync();
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
    return this.running && this.visible && this.inView;
  }

  private sync(): void {
    if (this.running && this.visible && this.inView) {
      if (!this.handle) {
        this.lastNow = 0; // force a zero-delta frame on resume
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
    if (this.startTime === 0) this.startTime = now;
    // First frame after a resume: report no elapsed time rather than the gap.
    const delta = this.lastNow === 0 ? 0 : (now - this.lastNow) / 1000;
    this.lastNow = now;
    // Clamp so a paused tab does not teleport an animation forward.
    this.elapsed += Math.min(delta, 1 / 15);
    this.callback(this.elapsed, delta, now);
  };
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
