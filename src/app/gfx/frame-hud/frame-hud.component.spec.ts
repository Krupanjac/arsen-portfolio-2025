import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FrameHudComponent } from './frame-hud.component';
import type { FrameStats } from '../shader-surface';
import { provideTestDeps } from '../../../testing/test-providers';

/** Resolves once the browser has run `count` animation frames. */
function frames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
    step(count);
  });
}

const STATS: FrameStats = {
  frameMs: 16.7,
  cpuMs: 1.2,
  gpuMs: 4.1,
  fps: 60,
  p95Ms: 17.1,
  worstMs: 18.4,
  renderScale: 1,
  width: 1280,
  height: 720,
  pixelsPerSecond: 55e6,
  frameIndex: 120,
};

describe('FrameHudComponent', () => {
  let fixture: ComponentFixture<FrameHudComponent>;
  let host: HTMLElement;
  /** The HUD reads the frame history once per draw, so this counts draws. */
  let draws: jasmine.Spy<(out: Float32Array) => number>;

  function create(inputs: { paused?: boolean; pausedBySystem?: boolean; stats?: FrameStats } = {}): void {
    fixture = TestBed.createComponent(FrameHudComponent);
    host = fixture.nativeElement;
    draws = jasmine.createSpy('historyProvider').and.returnValue(0);
    fixture.componentRef.setInput('historyProvider', draws);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  }

  /** Fades the host the way the hero's scroll veil does, then lets the HUD look. */
  async function fadeTo(opacity: number): Promise<void> {
    host.style.opacity = String(opacity);
    window.dispatchEvent(new Event('scroll'));
    await frames(2);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FrameHudComponent],
      providers: [provideTestDeps()],
    }).compileComponents();
  });

  it('is inert and hidden from assistive tech while faded out, and reachable again once shown (R8-6)', async () => {
    create();
    await frames(2);
    expect(host.hasAttribute('inert')).toBeFalse();
    expect(host.hasAttribute('aria-hidden')).toBeFalse();

    await fadeTo(0);
    expect(host.hasAttribute('inert')).toBeTrue();
    expect(host.getAttribute('aria-hidden')).toBe('true');

    await fadeTo(1);
    expect(host.hasAttribute('inert')).toBeFalse();
    expect(host.hasAttribute('aria-hidden')).toBeFalse();
  });

  it('draws every frame while visible and stops while hidden (R8-5)', async () => {
    create();
    await frames(3);
    expect(draws).toHaveBeenCalled();

    await fadeTo(0);
    draws.calls.reset();
    await frames(3);
    expect(draws).not.toHaveBeenCalled();

    await fadeTo(1);
    expect(draws).toHaveBeenCalled();
  });

  it('while paused, draws only when new stats arrive (R8-4)', async () => {
    create({ paused: true });
    await frames(2);
    draws.calls.reset();
    await frames(3);
    expect(draws).not.toHaveBeenCalled();

    fixture.componentRef.setInput('stats', STATS);
    fixture.detectChanges();
    await frames(2);
    expect(draws).toHaveBeenCalledTimes(1);
  });

  it('skips stats-driven redraws while hidden', async () => {
    create({ paused: true });
    await fadeTo(0);
    draws.calls.reset();

    fixture.componentRef.setInput('stats', STATS);
    fixture.detectChanges();
    await frames(2);
    expect(draws).not.toHaveBeenCalled();
  });

  it('draws every frame again on play, even with a paused redraw still pending (R8-10)', async () => {
    create({ paused: true });
    await frames(2);
    // New stats queue a single redraw, and play arrives before it has run.
    fixture.componentRef.setInput('stats', STATS);
    fixture.detectChanges();
    fixture.componentRef.setInput('paused', false);
    fixture.detectChanges();
    draws.calls.reset();
    await frames(4);
    expect(draws.calls.count()).toBeGreaterThanOrEqual(3);
  });

  it('says it is paused instead of showing a stale frame rate, and why when the system asked (R8-10)', () => {
    create({ paused: true, pausedBySystem: true, stats: STATS });
    const bar = host.querySelector('.hud__bar')!;
    expect(bar.textContent).toContain('HUD.PAUSED');
    expect(bar.textContent).toContain('HUD.REDUCED_MOTION');
    expect(bar.querySelector('.hud__fps')).toBeNull();

    // Paused by the visitor: no reason to give.
    fixture.componentRef.setInput('pausedBySystem', false);
    fixture.detectChanges();
    expect(bar.textContent).not.toContain('HUD.REDUCED_MOTION');

    fixture.componentRef.setInput('paused', false);
    fixture.detectChanges();
    expect(bar.querySelector('.hud__fps')?.textContent).toBe('60');
  });

  it('labels the control for what it will do, and reports a press (R8-10)', () => {
    create({ paused: true });
    const button = host.querySelector<HTMLButtonElement>('.hud__motion')!;
    expect(button.getAttribute('aria-label')).toBe('HUD.PLAY');

    const pressed = jasmine.createSpy('motionToggle');
    fixture.componentInstance.motionToggle.subscribe(pressed);
    button.click();
    expect(pressed).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('paused', false);
    fixture.detectChanges();
    expect(button.getAttribute('aria-label')).toBe('HUD.PAUSE');
  });
});
