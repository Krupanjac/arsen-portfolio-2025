import { UniformSnapshot, type UniformValue } from './shader';

describe('UniformSnapshot', () => {
  let snapshot: UniformSnapshot;

  beforeEach(() => {
    snapshot = new UniformSnapshot();
  });

  it('matches nothing before the first capture', () => {
    expect(snapshot.matches({})).toBeFalse();
    expect(snapshot.matches({ uTime: 0 })).toBeFalse();
  });

  it('matches the values it captured', () => {
    const uniforms = { uTime: 0, uTheme: 1, uAccent: [0.2, 0.1, 0.9] };
    snapshot.capture(uniforms);
    expect(snapshot.matches({ uTime: 0, uTheme: 1, uAccent: [0.2, 0.1, 0.9] })).toBeTrue();
  });

  it('copies arrays, so mutating one in place still reads as a change', () => {
    // The hero keeps one pointer array and updates it every frame.
    const pointer: number[] = [0, 0];
    snapshot.capture({ uMouse: pointer });
    pointer[0] = 0.5;
    expect(snapshot.matches({ uMouse: pointer })).toBeFalse();
  });

  it('sees a theme switch', () => {
    snapshot.capture({ uTheme: 1, uSky: [0.03, 0.04, 0.06] });
    expect(snapshot.matches({ uTheme: 0, uSky: [0.03, 0.04, 0.06] })).toBeFalse();
    expect(snapshot.matches({ uTheme: 1, uSky: [0.62, 0.68, 0.8] })).toBeFalse();
  });

  it('ignores differences too small to see, but not drift that adds up', () => {
    snapshot.capture({ uScroll: 0.5, uMouse: [0.25, -0.25] });
    expect(snapshot.matches({ uScroll: 0.5 + 2e-5, uMouse: [0.25 + 5e-5, -0.25] })).toBeTrue();
    expect(snapshot.matches({ uScroll: 0.5 + 1e-3, uMouse: [0.25, -0.25] })).toBeFalse();
    expect(snapshot.matches({ uScroll: 0.5, uMouse: [0.25, -0.2] })).toBeFalse();
  });

  it('scales the tolerance for large values', () => {
    snapshot.capture({ uSize: 1920 });
    expect(snapshot.matches({ uSize: 1920.05 })).toBeTrue();
    expect(snapshot.matches({ uSize: 1921 })).toBeFalse();
  });

  it('notices a uniform appearing, disappearing or changing shape', () => {
    snapshot.capture({ a: 1, b: [1, 2] });
    expect(snapshot.matches({ a: 1 })).toBeFalse();
    expect(snapshot.matches({ a: 1, b: [1, 2], c: 3 })).toBeFalse();
    expect(snapshot.matches({ a: 1, b: [1, 2, 3] })).toBeFalse();
    expect(snapshot.matches({ a: [1], b: [1, 2] })).toBeFalse();
    expect(snapshot.matches({ a: 1, b: 1 })).toBeFalse();
  });

  it('compares typed arrays element-wise', () => {
    snapshot.capture({ m: new Float32Array([1, 0, 0, 1]), i: new Int32Array([3, 4]) });
    expect(snapshot.matches({ m: new Float32Array([1, 0, 0, 1]), i: new Int32Array([3, 4]) })).toBeTrue();
    expect(snapshot.matches({ m: [1, 0, 0, 1], i: [3, 4] })).toBeTrue();
    expect(snapshot.matches({ m: new Float32Array([1, 0, 0, 1]), i: new Int32Array([3, 5]) })).toBeFalse();
  });

  it('compares textures by identity', () => {
    const a = {} as WebGLTexture;
    const b = {} as WebGLTexture;
    snapshot.capture({ uTex: a });
    expect(snapshot.matches({ uTex: a })).toBeTrue();
    expect(snapshot.matches({ uTex: b })).toBeFalse();
  });

  it('treats NaN as unchanged rather than redrawing forever', () => {
    snapshot.capture({ x: Number.NaN });
    expect(snapshot.matches({ x: Number.NaN })).toBeTrue();
    expect(snapshot.matches({ x: 0 })).toBeFalse();
  });

  it('forgets everything on clear, and drops stale keys on recapture', () => {
    snapshot.capture({ a: 1, b: 2 });
    snapshot.capture({ a: 1 } as Record<string, UniformValue>);
    expect(snapshot.matches({ a: 1 })).toBeTrue();
    snapshot.clear();
    expect(snapshot.matches({ a: 1 })).toBeFalse();
  });
});
