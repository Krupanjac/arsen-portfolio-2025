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

/** Answers the reduced-motion media query with `reduce`; every other query goes to the browser. */
function fakeReducedMotion(reduce: boolean): void {
  const real = window.matchMedia.bind(window);
  spyOn(window, 'matchMedia').and.callFake((query: string) =>
    query.includes('prefers-reduced-motion')
      ? ({
          matches: reduce,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        } as MediaQueryList)
      : real(query),
  );
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

  function create(): void {
    fixture = TestBed.createComponent(FrameHudComponent);
    host = fixture.nativeElement;
    draws = jasmine.createSpy('historyProvider').and.returnValue(0);
    fixture.componentRef.setInput('historyProvider', draws);
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
    fakeReducedMotion(false);
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

  it('under reduced motion, draws only when new stats arrive (R8-4)', async () => {
    fakeReducedMotion(true);
    create();
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
    fakeReducedMotion(true);
    create();
    await fadeTo(0);
    draws.calls.reset();

    fixture.componentRef.setInput('stats', STATS);
    fixture.detectChanges();
    await frames(2);
    expect(draws).not.toHaveBeenCalled();
  });
});
