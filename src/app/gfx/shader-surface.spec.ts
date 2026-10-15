import { ShaderSurface, type FrameStats } from './shader-surface';
import { REDUCED_MOTION_QUERY } from './render-loop';
import type { UniformValue } from './shader';

const FRAGMENT = `
in vec2 vUv;
out vec4 fragColor;
uniform vec3 uAccent;
uniform float uTime;
void main() {
  fragColor = vec4(uAccent * (0.5 + 0.5 * sin(uTime + vUv.x)), 1.0);
}
`;

function webgl2Available(): boolean {
  const gl = document.createElement('canvas').getContext('webgl2');
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return !!gl;
}

function nextEvent(target: EventTarget, type: string): Promise<void> {
  return new Promise((resolve) => target.addEventListener(type, () => resolve(), { once: true }));
}

/** Loses the surface's context and waits for the browser to restore it. */
async function loseAndRestore(canvas: HTMLCanvasElement): Promise<boolean> {
  const lose = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
  if (!lose) return false;
  const lost = nextEvent(canvas, 'webglcontextlost');
  lose.loseContext();
  await lost;
  // The browser decides whether a restore is allowed only once the lost
  // event has finished dispatching; asking from inside it is refused.
  await new Promise((resolve) => setTimeout(resolve));
  const restored = nextEvent(canvas, 'webglcontextrestored');
  lose.restoreContext();
  await restored;
  return true;
}

/**
 * Drives a real WebGL2 surface with hand-cranked animation frames. Pending
 * where the browser has no WebGL2 (a GPU-less CI runner, say): the pure
 * pieces are covered by their own specs either way.
 */
describe('ShaderSurface', () => {
  const hasWebGl2 = webgl2Available();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  let queue: Map<number, FrameRequestCallback>;
  let handles: number;
  let reduced: boolean;
  let motionListeners: Array<(event: MediaQueryListEvent) => void>;
  let canvas: HTMLCanvasElement;
  let surface: ShaderSurface | null;
  let draws: jasmine.Spy;
  let accent: number[];
  let provided: Array<[number, number]>;

  function frame(now: number): void {
    const due = Array.from(queue.values());
    queue.clear();
    for (const callback of due) callback(now);
  }

  function create(extra: { onStats?: (stats: FrameStats) => void } = {}): ShaderSurface {
    surface = new ShaderSurface(canvas, {
      fragmentSource: FRAGMENT,
      uniforms: (elapsed, delta): Record<string, UniformValue> => {
        provided.push([elapsed, delta]);
        return { uTime: 0, uAccent: accent };
      },
      ...extra,
    });
    return surface;
  }

  function setReducedMotion(matches: boolean): void {
    reduced = matches;
    for (const listener of motionListeners) listener({ matches } as MediaQueryListEvent);
  }

  beforeEach(() => {
    if (!hasWebGl2) pending('WebGL2 is not available in this browser');
    queue = new Map();
    handles = 0;
    reduced = false;
    motionListeners = [];
    surface = null;
    accent = [1, 0, 0];
    provided = [];
    spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback) => {
      queue.set(++handles, callback);
      return handles;
    });
    spyOn(window, 'cancelAnimationFrame').and.callFake((handle: number) => {
      queue.delete(handle);
    });
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    spyOn(window, 'matchMedia').and.callFake(
      () =>
        ({
          media: REDUCED_MOTION_QUERY,
          get matches() {
            return reduced;
          },
          addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
            motionListeners.push(listener),
          removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
            motionListeners = motionListeners.filter((l) => l !== listener);
          },
        }) as unknown as MediaQueryList,
    );
    draws = spyOn(WebGL2RenderingContext.prototype, 'drawArrays').and.callThrough();
    canvas = document.createElement('canvas');
    // Fixed, like the hero's: always intersecting, so only setActive can park it.
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:64px;height:32px';
    document.body.appendChild(canvas);
  });

  afterEach(() => {
    surface?.dispose();
    canvas?.remove();
  });

  it('renders every frame, starting at 75% scale, without reduced motion', () => {
    expect(create().init()).toBeTrue();
    frame(1000);
    frame(1016);
    frame(1033);
    expect(draws).toHaveBeenCalledTimes(3);
    expect(canvas.width).toBe(Math.round(64 * dpr * 0.75));
  });

  it('under reduced motion, draws only when the uniforms change (R8-4)', () => {
    reduced = true;
    const s = create();
    expect(s.init()).toBeTrue();
    expect(s.reducedMotion).toBeTrue();

    frame(1000);
    expect(draws).toHaveBeenCalledTimes(1);
    // A still frame is drawn at full resolution.
    expect(canvas.width).toBe(Math.round(64 * dpr));

    frame(1016);
    frame(1033);
    expect(draws).toHaveBeenCalledTimes(1);

    accent = [0, 1, 0]; // a theme switch
    frame(1050);
    expect(draws).toHaveBeenCalledTimes(2);
    frame(1066);
    expect(draws).toHaveBeenCalledTimes(2);

    s.setQualityLock(0.5);
    frame(1083);
    expect(draws).toHaveBeenCalledTimes(3);
    expect(canvas.width).toBe(Math.round(64 * dpr * 0.5));

    // The clock never moved.
    expect(provided.every(([elapsed, delta]) => elapsed === 0 && delta === 0)).toBeTrue();
  });

  it('follows the reduced-motion preference when it changes at runtime', () => {
    reduced = true;
    const s = create();
    s.init();
    frame(1000);
    frame(1016);
    expect(draws).toHaveBeenCalledTimes(1);

    setReducedMotion(false);
    expect(s.reducedMotion).toBeFalse();
    frame(1033);
    frame(1050);
    expect(draws).toHaveBeenCalledTimes(3);
    expect(provided[provided.length - 1][0]).toBeGreaterThan(0);

    setReducedMotion(true);
    frame(1066); // redraws once in the new mode…
    frame(1083); // …then stays still
    expect(draws).toHaveBeenCalledTimes(4);
  });

  it('reports a still frame right away, labelled as such', () => {
    reduced = true;
    const onStats = jasmine.createSpy('onStats');
    create({ onStats }).init();
    frame(1000);
    expect(onStats).toHaveBeenCalledTimes(1);
    const stats = onStats.calls.mostRecent().args[0] as FrameStats;
    expect(stats.scalerMode).toBe('still');
    expect(stats.renderScale).toBe(1);
  });

  it('keeps a parked surface parked through a context loss and restore (R8-2)', async () => {
    const s = create();
    s.init();
    s.setActive(false);
    expect(queue.size).toBe(0);

    if (!(await loseAndRestore(canvas))) pending('WEBGL_lose_context is not available');

    expect(queue.size).toBe(0);
    s.setActive(true);
    expect(queue.size).toBe(1);
    frame(5000);
    expect(draws).toHaveBeenCalled();
  });

  it('attaches its observers once, however often the context comes back (R8-5)', async () => {
    const resizeObserve = spyOn(ResizeObserver.prototype, 'observe').and.callThrough();
    const intersectionObserve = spyOn(IntersectionObserver.prototype, 'observe').and.callThrough();
    const resizeDisconnect = spyOn(ResizeObserver.prototype, 'disconnect').and.callThrough();
    const s = create();
    s.init();
    expect(s.init()).toBeTrue(); // a second init changes nothing
    expect(resizeObserve).toHaveBeenCalledTimes(1);
    expect(intersectionObserve).toHaveBeenCalledTimes(1);
    expect(motionListeners.length).toBe(1);

    if (!(await loseAndRestore(canvas))) pending('WEBGL_lose_context is not available');

    expect(resizeObserve).toHaveBeenCalledTimes(1);
    expect(intersectionObserve).toHaveBeenCalledTimes(1);
    expect(motionListeners.length).toBe(1);

    s.dispose();
    expect(resizeDisconnect).toHaveBeenCalled();
    expect(motionListeners.length).toBe(0);
    expect(queue.size).toBe(0);
  });
});
