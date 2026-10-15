import { ResolutionScaler } from './resolution-scaler';

const VSYNC_60 = 1000 / 60;
const VSYNC_120 = 1000 / 120;
/** 75% of a 60 Hz frame: the GPU budget the scaler defends by default. */
const GPU_BUDGET = 0.75 * VSYNC_60;

interface Frame {
  intervalMs: number;
  gpuMs?: number;
}

/** Deterministic PRNG (mulberry32), so the noisy loads replay identically. */
function random(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The interval a frame of `workMs` gets on a vsync-locked display. */
function presented(workMs: number, vsync = VSYNC_60): number {
  return Math.max(1, Math.ceil(workMs / vsync - 1e-9)) * vsync;
}

/**
 * Drives the scaler for `seconds` of simulated time. `load` is asked about the
 * scale the previous frame was rendered at, the way a real frame interval and
 * GPU sample describe work already done. Returns the scale chosen each frame.
 */
function run(
  scaler: ResolutionScaler,
  seconds: number,
  load: (scale: number) => Frame,
): number[] {
  const trace: number[] = [];
  let scale = scaler.current;
  for (let t = 0; t < seconds * 1000; ) {
    const frame = load(scale);
    t += frame.intervalMs > 0 ? frame.intervalMs : VSYNC_60;
    scale = scaler.update(frame.intervalMs, frame.gpuMs ?? Number.NaN);
    trace.push(scale);
  }
  return trace;
}

function changes(trace: number[]): number {
  let n = 0;
  for (let i = 1; i < trace.length; i++) if (trace[i] !== trace[i - 1]) n++;
  return n;
}

function neverFalls(trace: number[]): boolean {
  return trace.every((s, i) => i === 0 || s >= trace[i - 1]);
}

function gpuFits(scale: number, gpu: (scale: number) => number): boolean {
  return gpu(scale) <= GPU_BUDGET;
}

describe('ResolutionScaler', () => {
  let scaler: ResolutionScaler;

  beforeEach(() => {
    scaler = new ResolutionScaler();
  });

  it('starts at 0.75, not at the minimum', () => {
    expect(scaler.current).toBe(0.75);
    expect(scaler.mode).toBe('warmup');
  });

  it('is not pinned down by a slow start', () => {
    // The old scaler pinned itself at 0.45 after one slow startup frame.
    for (const timer of [true, false]) {
      const fresh = new ResolutionScaler();
      let n = 0;
      const trace = run(fresh, 6, () =>
        ++n <= 5
          ? { intervalMs: 200, gpuMs: timer ? 80 : Number.NaN }
          : { intervalMs: VSYNC_60, gpuMs: timer ? 3 : Number.NaN },
      );
      expect(Math.min(...trace)).toBe(0.75);
      expect(fresh.current).toBe(1);
    }
  });

  describe('with a GPU timer', () => {
    it('climbs to full resolution at a vsync-locked 60 Hz when GPU time is low', () => {
      const trace = run(scaler, 6, () => ({ intervalMs: VSYNC_60, gpuMs: 3 }));
      expect(scaler.current).toBe(1);
      expect(scaler.mode).toBe('gpu');
      expect(neverFalls(trace)).toBeTrue();
      // Five steps, each after a run of comfortable samples: a few seconds, not a minute.
      expect(trace.indexOf(1) * VSYNC_60).toBeLessThan(5000);
    });

    it('drops when GPU time exceeds the budget, sized to the overshoot', () => {
      // Fragment cost follows pixel count: 30 ms at 0.75 against a 12.5 ms budget.
      const gpu = (s: number) => 30 * (s / 0.75) ** 2;
      const trace = run(scaler, 3, (s) => ({ intervalMs: presented(gpu(s)), gpuMs: gpu(s) }));
      expect(scaler.current).toBe(0.45);
      // One decisive move rather than six steps with every frame late in between.
      expect(changes(trace)).toBe(1);
      expect(trace.indexOf(0.45)).toBeLessThan(40);
    });

    it('settles on a scale whose GPU time fits the budget', () => {
      const gpu = (s: number) => 20 * (s / 0.75) ** 2;
      const trace = run(scaler, 10, (s) => ({ intervalMs: presented(gpu(s)), gpuMs: gpu(s) }));
      expect(gpu(scaler.current)).toBeLessThanOrEqual(GPU_BUDGET);
      expect(scaler.current).toBeGreaterThanOrEqual(0.5);
      expect(changes(trace)).toBeLessThanOrEqual(2);
    });

    it('budgets for the target rate, not a faster display', () => {
      // 9 ms of GPU time fits 60 fps but not 120: on a 120 Hz panel the scale holds.
      const trace = run(scaler, 10, () => ({ intervalMs: VSYNC_120, gpuMs: 9 }));
      expect(trace.every((s) => s === 0.75)).toBeTrue();
      expect(scaler.refreshMs).toBeCloseTo(VSYNC_120, 1);
    });

    it('does not oscillate when GPU time hovers around a threshold', () => {
      const rand = random(7);
      const gpu = (s: number) => 5 * (s / 0.75) ** 2 * (1 + 0.1 * (rand() * 2 - 1));
      const trace = run(scaler, 60, (s) => ({ intervalMs: VSYNC_60, gpuMs: gpu(s) }));
      expect(neverFalls(trace)).toBeTrue();
      expect(changes(trace)).toBeLessThanOrEqual(4);
    });

    it('distrusts a slow cadence while its own GPU time explains it', () => {
      // 25 ms of GPU time halves a 60 Hz display's rate; the 33 ms cadence that
      // results must not be taken for a 30 Hz display.
      const gpu = (s: number) => 25 * (s / 0.75) ** 2;
      run(scaler, 5, (s) => ({ intervalMs: presented(gpu(s)), gpuMs: gpu(s) }));
      expect(gpu(scaler.current)).toBeLessThanOrEqual(GPU_BUDGET);
    });

    it('drops in one move for a load spike, and climbs back once it passes', () => {
      let t = 0;
      const trace = run(scaler, 30, (s) => {
        t += VSYNC_60;
        const spike = t > 8000 && t < 13000 ? 3 : 1;
        return { intervalMs: VSYNC_60, gpuMs: spike * 6 * s * s };
      });
      const atSpike = trace.slice(Math.round(8000 / VSYNC_60), Math.round(13000 / VSYNC_60));
      expect(changes(atSpike)).toBe(1);
      expect(gpuFits(atSpike[atSpike.length - 1], (s) => 18 * s * s)).toBeTrue();
      expect(scaler.current).toBe(1);
    });

    it('falls back to dropped frames when the timer stops answering', () => {
      run(scaler, 2, () => ({ intervalMs: VSYNC_60, gpuMs: 5 }));
      expect(scaler.mode).toBe('gpu');
      run(scaler, 2, () => ({ intervalMs: VSYNC_60 }));
      expect(scaler.mode).toBe('frames');
    });
  });

  describe('without a GPU timer', () => {
    it('climbs while no frames drop', () => {
      const trace = run(scaler, 6, () => ({ intervalMs: VSYNC_60 }));
      expect(scaler.current).toBe(1);
      expect(scaler.mode).toBe('frames');
      expect(neverFalls(trace)).toBeTrue();
      expect(trace.indexOf(1) * VSYNC_60).toBeLessThan(5000);
    });

    it('falls while frames drop, then holds the highest scale that does not', () => {
      // Above 0.6 every other frame misses its vsync; at 0.6 and below none do.
      let odd = false;
      const trace = run(scaler, 20, (s) => {
        odd = !odd;
        return { intervalMs: s > 0.6 + 1e-9 && odd ? 2 * VSYNC_60 : VSYNC_60 };
      });
      expect(scaler.current).toBe(0.6);
      expect(Math.min(...trace)).toBe(0.6);
      // It reached 0.6 within a couple of seconds of warming up…
      expect(trace.indexOf(0.6)).toBeLessThan(150);
      // …and the probes back up are brief and rare, not a constant flicker.
      const settled = trace.slice(trace.indexOf(0.6));
      expect(settled.filter((s) => s > 0.6).length / settled.length).toBeLessThan(0.05);
      expect(changes(settled)).toBeLessThanOrEqual(4);
    });

    it('does not oscillate under a borderline load', () => {
      // The work fits a 60 Hz vsync up to 0.8 and misses it from 0.85 on.
      const rand = random(42);
      const work = (s: number) => 24.2 * s * s * (1 + 0.04 * (rand() * 2 - 1));
      const trace = run(scaler, 120, (s) => ({ intervalMs: presented(work(s)) }));
      expect(scaler.current).toBe(0.8);
      expect(Math.max(...trace)).toBeLessThanOrEqual(0.85);
      // Each failed probe holds the level above off for longer: a handful of
      // changes in two minutes, the second minute almost none.
      expect(changes(trace)).toBeLessThanOrEqual(12);
      expect(changes(trace.slice(trace.length / 2))).toBeLessThanOrEqual(2);
      expect(trace.filter((s) => s > 0.8).length / trace.length).toBeLessThan(0.02);
    });

    it('accepts a 30 Hz cadence that the minimum scale cannot speed up', () => {
      // A 30 Hz panel, or a browser saving power: 33 ms whatever the scale.
      const trace = run(scaler, 12, () => ({ intervalMs: 2 * VSYNC_60 }));
      const firstDip = trace.indexOf(0.45);
      expect(firstDip).toBeGreaterThan(0);
      // One short test at the minimum, then back, then up: nothing drops at 30 Hz.
      expect(trace.lastIndexOf(0.45) - firstDip).toBeLessThan(40);
      expect(scaler.current).toBe(1);
    });

    it('fights a slow cadence that is its own cost', () => {
      // Every frame misses at 0.75; the minimum fits, and so does 0.6.
      const work = (s: number) => 25 * (s / 0.75) ** 2;
      const trace = run(scaler, 15, (s) => ({ intervalMs: presented(work(s)) }));
      expect(trace).toContain(0.45);
      expect(scaler.current).toBe(0.6);
      expect(trace.slice(trace.indexOf(0.45))).not.toContain(0.75);
    });

    it('shrugs off an isolated hitch', () => {
      // A garbage-collection pause every three seconds is not a GPU problem.
      let n = 0;
      const trace = run(scaler, 20, () => ({ intervalMs: ++n % 180 === 0 ? 50 : VSYNC_60 }));
      expect(neverFalls(trace)).toBeTrue();
      expect(scaler.current).toBe(1);
    });

    it('recovers full resolution after a load spike passes', () => {
      let t = 0;
      const trace = run(scaler, 30, (s) => {
        t += VSYNC_60;
        const spike = t > 8000 && t < 13000 ? 2.2 : 1;
        return { intervalMs: presented(spike * 12 * s * s) };
      });
      expect(Math.min(...trace)).toBeLessThanOrEqual(0.75);
      expect(scaler.current).toBe(1);
    });

    it('does not count the gap across a pause as a dropped frame', () => {
      const trace = run(scaler, 6, (() => {
        let n = 0;
        return () => ({ intervalMs: ++n % 40 === 0 ? Number.NaN : VSYNC_60 });
      })());
      expect(neverFalls(trace)).toBeTrue();
      expect(scaler.current).toBe(1);
    });
  });

  describe('quality lock', () => {
    it('overrides every signal', () => {
      scaler.lock(0.5);
      const heavy = run(scaler, 3, () => ({ intervalMs: 3 * VSYNC_60, gpuMs: 50 }));
      const light = run(scaler, 3, () => ({ intervalMs: VSYNC_60, gpuMs: 1 }));
      const noTimer = run(scaler, 3, () => ({ intervalMs: VSYNC_60 }));
      expect([...heavy, ...light, ...noTimer].every((s) => s === 0.5)).toBeTrue();
      expect(scaler.isLocked).toBeTrue();
      expect(scaler.mode).toBe('locked');
    });

    it('snaps to the step grid and the bounds', () => {
      scaler.lock(0.72);
      expect(scaler.current).toBe(0.7);
      scaler.lock(0.1);
      expect(scaler.current).toBe(0.45);
      scaler.lock(3);
      expect(scaler.current).toBe(1);
    });

    it('hands control back on unlock, from the locked scale', () => {
      scaler.lock(0.5);
      run(scaler, 1, () => ({ intervalMs: VSYNC_60, gpuMs: 3 }));
      scaler.unlock();
      expect(scaler.current).toBe(0.5);
      run(scaler, 8, () => ({ intervalMs: VSYNC_60, gpuMs: 3 }));
      expect(scaler.current).toBe(1);
    });

    it('treats unlock without a lock as a no-op', () => {
      run(scaler, 2, () => ({ intervalMs: VSYNC_60, gpuMs: 3 }));
      const before = scaler.current;
      scaler.unlock();
      expect(scaler.current).toBe(before);
      expect(scaler.isLocked).toBeFalse();
    });
  });

  it('only ever picks 0.05 steps within [0.45, 1]', () => {
    const rand = random(1);
    const trace = run(scaler, 60, (s) => {
      const work = (4 + rand() * 30) * s * s;
      return { intervalMs: presented(work), gpuMs: rand() < 0.5 ? work : Number.NaN };
    });
    for (const s of trace) {
      expect(s).toBeGreaterThanOrEqual(0.45);
      expect(s).toBeLessThanOrEqual(1);
      expect(Math.abs(s * 20 - Math.round(s * 20))).toBeLessThan(1e-9);
    }
  });

  it('reset returns to the initial scale and forgets the display', () => {
    run(scaler, 6, () => ({ intervalMs: VSYNC_60, gpuMs: 3 }));
    expect(scaler.current).toBe(1);
    scaler.reset();
    expect(scaler.current).toBe(0.75);
    expect(scaler.refreshMs).toBeNaN();
    expect(scaler.mode).toBe('warmup');
  });
});
