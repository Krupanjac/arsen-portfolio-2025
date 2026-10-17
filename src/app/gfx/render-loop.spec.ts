import { RenderLoop } from './render-loop';

interface Call {
  elapsed: number;
  delta: number;
  now: number;
  resumed: boolean;
}

describe('RenderLoop', () => {
  let queue: Map<number, FrameRequestCallback>;
  let handles: number;
  let visibility: DocumentVisibilityState;
  let calls: Call[];
  let loop: RenderLoop;

  /** Runs one animation frame at `now`, the way the browser would. */
  function frame(now: number): void {
    const due = Array.from(queue.values());
    queue.clear();
    for (const callback of due) callback(now);
  }

  function setVisibility(state: DocumentVisibilityState): void {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  beforeEach(() => {
    queue = new Map();
    handles = 0;
    visibility = 'visible';
    calls = [];
    spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback) => {
      queue.set(++handles, callback);
      return handles;
    });
    spyOn(window, 'cancelAnimationFrame').and.callFake((handle: number) => {
      queue.delete(handle);
    });
    spyOnProperty(document, 'visibilityState', 'get').and.callFake(() => visibility);
    loop = new RenderLoop((elapsed, delta, now, resumed) => calls.push({ elapsed, delta, now, resumed }));
  });

  afterEach(() => loop.stop());

  it('runs frames once started, with a zero-delta first frame', () => {
    expect(queue.size).toBe(0);
    loop.start();
    expect(loop.isRunning).toBeTrue();
    frame(1000);
    frame(1016);
    expect(calls.length).toBe(2);
    expect(calls[0]).toEqual({ elapsed: 0, delta: 0, now: 1000, resumed: true });
    expect(calls[1].resumed).toBeFalse();
    expect(calls[1].delta).toBeCloseTo(0.016, 6);
    expect(calls[1].elapsed).toBeCloseTo(0.016, 6);
  });

  it('stays parked when the observer reports the canvas in view (R8-2)', () => {
    loop.start();
    loop.setActive(false);
    expect(queue.size).toBe(0);
    // A fixed canvas always intersects: the observer keeps saying so.
    loop.setInView(true);
    loop.setInView(false);
    loop.setInView(true);
    expect(queue.size).toBe(0);
    expect(loop.isRunning).toBeFalse();
    loop.setActive(true);
    expect(queue.size).toBe(1);
  });

  it('stays paused while occluded, whatever the owner says', () => {
    loop.start();
    loop.setInView(false);
    loop.setActive(true);
    expect(queue.size).toBe(0);
    loop.setInView(true);
    expect(queue.size).toBe(1);
  });

  it('pauses while the document is hidden, and resumes only if nothing else objects', () => {
    loop.start();
    setVisibility('hidden');
    expect(queue.size).toBe(0);
    setVisibility('visible');
    expect(queue.size).toBe(1);

    setVisibility('hidden');
    loop.setActive(false);
    setVisibility('visible');
    expect(queue.size).toBe(0);
  });

  it('does not start while the document is hidden', () => {
    visibility = 'hidden';
    loop.start();
    expect(queue.size).toBe(0);
  });

  it('reports a resumed frame with no delta after a pause', () => {
    loop.start();
    frame(1000);
    frame(1016);
    loop.setActive(false);
    loop.setActive(true);
    frame(9000);
    const last = calls[calls.length - 1];
    expect(last.resumed).toBeTrue();
    expect(last.delta).toBe(0);
    expect(last.elapsed).toBeCloseTo(0.016, 6);
  });

  it('never schedules a second frame for the same tick', () => {
    loop.start();
    loop.setActive(true);
    loop.setInView(true);
    expect(queue.size).toBe(1);
  });

  it('freezes the clock without stopping the frames', () => {
    loop.start();
    frame(1000);
    frame(1016);
    loop.setClockFrozen(true);
    frame(1032);
    frame(1048);
    expect(calls.length).toBe(4);
    expect(calls[2].delta).toBe(0);
    expect(calls[3].delta).toBe(0);
    expect(calls[3].elapsed).toBeCloseTo(0.016, 6);
    loop.setClockFrozen(false);
    frame(1064);
    // Resumes from where it stood: no jump for the time spent frozen.
    expect(calls[4].elapsed).toBeCloseTo(0.032, 6);
  });

  it('clamps a long hitch so animations do not teleport', () => {
    loop.start();
    frame(1000);
    frame(2000);
    expect(calls[1].delta).toBe(1);
    expect(calls[1].elapsed).toBeCloseTo(1 / 15, 6);
  });

  it('stops listening for visibility once stopped', () => {
    loop.start();
    loop.stop();
    expect(queue.size).toBe(0);
    setVisibility('hidden');
    setVisibility('visible');
    expect(queue.size).toBe(0);
    expect(loop.isRunning).toBeFalse();
  });
});
