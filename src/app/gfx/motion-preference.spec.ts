import { MOTION_STORAGE_KEY, MotionPreference } from './motion-preference';
import { REDUCED_MOTION_QUERY } from './render-loop';

/** In-memory Storage; `blocked` makes every call throw, as a locked-down browser does. */
class FakeStorage {
  readonly data = new Map<string, string>();
  blocked = false;

  getItem(key: string): string | null {
    this.check();
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.check();
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.check();
    this.data.delete(key);
  }

  private check(): void {
    if (this.blocked) throw new DOMException('Storage is blocked', 'SecurityError');
  }
}

describe('MotionPreference', () => {
  let reduced: boolean;
  let listeners: Array<(event: MediaQueryListEvent) => void>;
  let storage: FakeStorage;
  let changes: boolean[];
  let preference: MotionPreference | null;

  function create(): MotionPreference {
    preference?.dispose();
    preference = new MotionPreference((enabled) => changes.push(enabled), storage);
    return preference;
  }

  function setSystemReduced(matches: boolean): void {
    reduced = matches;
    for (const listener of listeners) listener({ matches } as MediaQueryListEvent);
  }

  beforeEach(() => {
    reduced = false;
    listeners = [];
    storage = new FakeStorage();
    changes = [];
    preference = null;
    spyOn(window, 'matchMedia').and.callFake(
      () =>
        ({
          media: REDUCED_MOTION_QUERY,
          get matches() {
            return reduced;
          },
          addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
            listeners.push(listener),
          removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
            listeners = listeners.filter((l) => l !== listener);
          },
        }) as unknown as MediaQueryList,
    );
  });

  afterEach(() => preference?.dispose());

  it('plays by default, and starts paused when the system asks for reduced motion', () => {
    expect(create().enabled).toBeTrue();
    expect(preference!.heldBySystem).toBeFalse();

    reduced = true;
    const p = create();
    expect(p.enabled).toBeFalse();
    expect(p.heldBySystem).toBeTrue();
  });

  it("lets the visitor's choice override the system, and remembers it", () => {
    reduced = true;
    const p = create();
    p.toggle();
    expect(p.enabled).toBeTrue();
    expect(p.heldBySystem).toBeFalse();
    expect(changes).toEqual([true]);
    expect(storage.data.get(MOTION_STORAGE_KEY)).toBe('on');

    // The next visit.
    expect(create().enabled).toBeTrue();
  });

  it('starts from a stored choice, and ignores one it does not recognise', () => {
    storage.data.set(MOTION_STORAGE_KEY, 'off');
    const p = create();
    expect(p.enabled).toBeFalse();
    expect(p.heldBySystem).toBeFalse(); // paused by choice, not by the system

    storage.data.set(MOTION_STORAGE_KEY, 'sometimes');
    expect(create().enabled).toBeTrue();
  });

  it("stores only a choice that differs from the system's default", () => {
    const p = create();
    p.set(false);
    expect(storage.data.get(MOTION_STORAGE_KEY)).toBe('off');

    p.set(true); // what the system would pick anyway
    expect(storage.data.has(MOTION_STORAGE_KEY)).toBeFalse();
    expect(changes).toEqual([false, true]);
  });

  it('follows the system until the visitor chooses, then keeps their choice', () => {
    const p = create();
    setSystemReduced(true);
    expect(p.enabled).toBeFalse();
    expect(changes).toEqual([false]);

    p.set(true);
    setSystemReduced(false);
    setSystemReduced(true);
    expect(p.enabled).toBeTrue();
    expect(changes).toEqual([false, true]);
  });

  it('reports only real changes', () => {
    const p = create();
    p.set(true);
    setSystemReduced(false);
    expect(changes).toEqual([]);
  });

  it('still works, for this page only, when storage is blocked', () => {
    storage.blocked = true;
    reduced = true;
    const p = create();
    expect(p.enabled).toBeFalse();
    expect(() => p.toggle()).not.toThrow();
    expect(p.enabled).toBeTrue();
  });

  it('stops listening to the system when disposed', () => {
    const p = create();
    expect(listeners.length).toBe(1);
    p.dispose();
    expect(listeners.length).toBe(0);
  });
});
