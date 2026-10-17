import { FrameTimer } from './frame-timer';

const EXT = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb };

/**
 * Just enough of WebGL2 for timer queries. Queries complete when the test
 * says so, which is the point: real ones resolve a few frames late.
 */
class FakeGl {
  readonly QUERY_RESULT = 0x8866;
  readonly QUERY_RESULT_AVAILABLE = 0x8867;
  disjoint = false;
  calls = 0;
  created = 0;
  deleted = 0;
  /** GPU time in ms per query, null while pending. */
  private readonly results = new Map<object, number | null>();
  private readonly pending: object[] = [];

  createQuery(): object {
    this.calls++;
    this.created++;
    return {};
  }
  deleteQuery(query: object): void {
    this.calls++;
    this.deleted++;
    this.results.delete(query);
  }
  beginQuery(_target: number, query: object): void {
    this.calls++;
    this.results.set(query, null);
    this.pending.push(query);
  }
  endQuery(_target: number): void {
    this.calls++;
  }
  getParameter(pname: number): unknown {
    this.calls++;
    return pname === EXT.GPU_DISJOINT_EXT ? this.disjoint : null;
  }
  getQueryParameter(query: object, pname: number): unknown {
    this.calls++;
    const ms = this.results.get(query) ?? null;
    return pname === this.QUERY_RESULT_AVAILABLE ? ms !== null : (ms ?? 0) * 1e6;
  }
  /** Completes the oldest query still running on the "GPU". */
  finishNext(ms: number): void {
    const query = this.pending.shift();
    if (query) this.results.set(query, ms);
  }
}

function withIntervals(intervals: number[]): FrameTimer {
  const timer = new FrameTimer(null as unknown as WebGL2RenderingContext, null);
  let now = 1000;
  timer.tick(now);
  for (const ms of intervals) {
    now += ms;
    timer.tick(now);
  }
  return timer;
}

describe('FrameTimer', () => {
  describe('intervals', () => {
    it('has no interval for the first frame, nor across a discontinuity', () => {
      const timer = new FrameTimer(null as unknown as WebGL2RenderingContext, null);
      expect(timer.tick(100)).toBeNaN();
      expect(timer.tick(116)).toBe(16);
      timer.markDiscontinuity();
      expect(timer.tick(5000)).toBeNaN();
      expect(timer.tick(5020)).toBe(20);
      const out = new Float32Array(8);
      expect(timer.history(out)).toBe(2);
      expect(Array.from(out.subarray(0, 2))).toEqual([16, 20]);
    });

    it('clamps a stalled frame so one breakpoint does not poison the stats', () => {
      const timer = withIntervals([16, 3000]);
      expect(timer.snapshot(1, 1, 1).worstMs).toBe(200);
    });

    it('takes p95 by nearest rank, and worst as the maximum', () => {
      // 1..100 in a scrambled order: the 95th smallest is 95.
      const values = Array.from({ length: 100 }, (_, i) => ((i * 37) % 100) + 1);
      const stats = withIntervals(values).snapshot(1, 1, 1);
      expect(stats.p95Ms).toBe(95);
      expect(stats.worstMs).toBe(100);
    });

    it('moves the p95 on the second slow frame in twenty, not the first', () => {
      const stats = withIntervals([...Array(19).fill(16), 50]).snapshot(1, 1, 1);
      expect(stats.p95Ms).toBe(16);
      expect(withIntervals([...Array(18).fill(16), 50, 50]).snapshot(1, 1, 1).p95Ms).toBe(50);
    });

    it('derives fps and fill rate from the latest interval', () => {
      const stats = withIntervals([16, 20]).snapshot(0.5, 200, 100);
      expect(stats.frameMs).toBe(20);
      expect(stats.fps).toBe(50);
      expect(stats.pixelsPerSecond).toBe(200 * 100 * 50);
      expect(stats.renderScale).toBe(0.5);
      expect(stats.width).toBe(200);
      expect(stats.height).toBe(100);
    });

    it('reports zeros before any interval exists', () => {
      const stats = new FrameTimer(null as unknown as WebGL2RenderingContext, null).snapshot(1, 10, 10);
      expect(stats.frameMs).toBe(0);
      expect(stats.fps).toBe(0);
      expect(stats.p95Ms).toBe(0);
      expect(stats.worstMs).toBe(0);
      expect(stats.gpuMs).toBeNaN();
    });
  });

  describe('history', () => {
    it('returns the ring oldest first, across the wrap-around', () => {
      const timer = withIntervals(Array.from({ length: 130 }, (_, i) => i + 1));
      const out = new Float32Array(120);
      expect(timer.history(out)).toBe(120);
      expect(out[0]).toBe(11);
      expect(out[119]).toBe(130);
      expect(timer.snapshot(1, 1, 1).worstMs).toBe(130);
    });

    it('fills only what fits, keeping the most recent frames', () => {
      const timer = withIntervals([1, 2, 3, 4, 5]);
      const out = new Float32Array(3);
      expect(timer.history(out)).toBe(3);
      expect(Array.from(out)).toEqual([3, 4, 5]);
    });
  });

  describe('GPU time', () => {
    let gl: FakeGl;
    let timer: FrameTimer;

    function frame(tag: number): void {
      timer.begin(tag);
      timer.end();
    }

    beforeEach(() => {
      gl = new FakeGl();
      timer = new FrameTimer(gl as unknown as WebGL2RenderingContext, EXT);
    });

    it('hands each sample out once, under the tag it was recorded with', () => {
      expect(timer.gpuSupported).toBeTrue();
      frame(7);
      expect(timer.takeGpuMs(7)).toBeNaN(); // still running
      gl.finishNext(2.5);
      frame(7); // end() polls and collects it
      expect(timer.takeGpuMs(7)).toBeCloseTo(2.5, 6);
      expect(timer.takeGpuMs(7)).toBeNaN();
      // The HUD still sees the latest value.
      expect(timer.snapshot(1, 1, 1).gpuMs).toBeCloseTo(2.5, 6);
    });

    it('withholds a sample recorded under an older tag', () => {
      frame(1);
      gl.finishNext(4);
      frame(2);
      expect(timer.takeGpuMs(2)).toBeNaN();
    });

    it('throws everything in flight away on a disjoint event', () => {
      frame(1);
      frame(1);
      gl.finishNext(3);
      gl.disjoint = true;
      expect(timer.poll()).toBeFalse();
      expect(timer.takeGpuMs(1)).toBeNaN();
      expect(timer.snapshot(1, 1, 1).gpuMs).toBeNaN();
      expect(gl.deleted).toBe(2);
    });

    it('keeps at most four queries in flight and reuses the query objects', () => {
      for (let i = 0; i < 6; i++) frame(0);
      expect(gl.created).toBe(4);
      for (let i = 0; i < 4; i++) gl.finishNext(1);
      expect(timer.poll()).toBeTrue();
      for (let i = 0; i < 4; i++) frame(0);
      expect(gl.created).toBe(4);
    });

    it('makes no GL calls to poll when nothing is in flight', () => {
      expect(timer.poll()).toBeFalse();
      expect(gl.calls).toBe(0);
    });

    it('works without the extension, reporting no GPU time', () => {
      const plain = new FrameTimer(null as unknown as WebGL2RenderingContext, null);
      expect(plain.gpuSupported).toBeFalse();
      plain.begin(0);
      plain.end();
      expect(plain.poll()).toBeFalse();
      expect(plain.takeGpuMs(0)).toBeNaN();
    });

    it('deletes every query object on dispose', () => {
      frame(0);
      frame(0);
      gl.finishNext(1);
      timer.poll();
      timer.dispose();
      expect(gl.deleted).toBe(gl.created);
    });
  });
});
