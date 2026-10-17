import { ElementRef, NgZone } from '@angular/core';
import { GpuSurfaceComponent } from './gpu-surface.component';

const FRAGMENT = `
in vec2 vUv;
out vec4 fragColor;
void main() { fragColor = vec4(vUv, 0.0, 1.0); }
`;

function webgl2Available(): boolean {
  const gl = document.createElement('canvas').getContext('webgl2');
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return !!gl;
}

/**
 * Built by hand rather than through TestBed: the component's whole job is to
 * pass its inputs to the surface at the right moment, and that is easiest to
 * see with the lifecycle hooks called directly.
 */
describe('GpuSurfaceComponent', () => {
  const hasWebGl2 = webgl2Available();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  let queue: Map<number, FrameRequestCallback>;
  let handles: number;
  let zone: jasmine.SpyObj<NgZone>;
  let canvas: HTMLCanvasElement;
  let component: GpuSurfaceComponent;

  function frame(now: number): void {
    const due = Array.from(queue.values());
    queue.clear();
    for (const callback of due) callback(now);
  }

  beforeEach(() => {
    queue = new Map();
    handles = 0;
    spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback) => {
      queue.set(++handles, callback);
      return handles;
    });
    spyOn(window, 'cancelAnimationFrame').and.callFake((handle: number) => {
      queue.delete(handle);
    });
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    // Continuous rendering whatever the machine running the tests prefers.
    spyOn(window, 'matchMedia').and.returnValue({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as MediaQueryList);
    zone = jasmine.createSpyObj<NgZone>('NgZone', ['run', 'runOutsideAngular']);
    zone.run.and.callFake(((fn: () => unknown) => fn()) as never);
    zone.runOutsideAngular.and.callFake(((fn: () => unknown) => fn()) as never);

    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:64px;height:32px';
    document.body.appendChild(canvas);
    component = new GpuSurfaceComponent('browser', zone);
    component.canvasRef = new ElementRef(canvas);
    component.fragmentSource = FRAGMENT;
    component.uniformProvider = () => ({});
  });

  afterEach(() => {
    component.ngOnDestroy();
    canvas.remove();
  });

  it('asks the browser for the default GPU unless told otherwise (R8-5)', () => {
    const getContext = spyOn(canvas, 'getContext').and.returnValue(null);
    const failed = jasmine.createSpy('failed');
    component.failed.subscribe(failed);
    component.ngAfterViewInit();
    expect(getContext).toHaveBeenCalledWith('webgl2', jasmine.objectContaining({ powerPreference: 'default' }));
    expect(failed).toHaveBeenCalled();
  });

  it('passes an explicit power preference through', () => {
    const getContext = spyOn(canvas, 'getContext').and.returnValue(null);
    component.powerPreference = 'high-performance';
    component.ngAfterViewInit();
    expect(getContext).toHaveBeenCalledWith(
      'webgl2',
      jasmine.objectContaining({ powerPreference: 'high-performance' }),
    );
  });

  describe('with WebGL2', () => {
    beforeEach(() => {
      if (!hasWebGl2) pending('WebGL2 is not available in this browser');
    });

    it('starts parked when bound with [active]="false", and never draws first (R8-2)', () => {
      const draws = spyOn(WebGL2RenderingContext.prototype, 'drawArrays').and.callThrough();
      component.active = false;
      component.ngAfterViewInit();
      expect(queue.size).toBe(0);
      frame(1000);
      expect(draws).not.toHaveBeenCalled();

      component.setActive(true);
      expect(component.active).toBeTrue();
      frame(1016);
      expect(draws).toHaveBeenCalledTimes(1);
    });

    it('applies a quality lock set before the surface existed', () => {
      component.qualityLock = 0.5;
      component.ngAfterViewInit();
      frame(1000);
      expect(canvas.width).toBe(Math.round(64 * dpr * 0.5));

      component.setQualityLock(null);
      expect(component.qualityLock).toBeNull();
    });

    it('holds the picture when bound with [still]="true" before the surface existed (R8-10)', () => {
      const draws = spyOn(WebGL2RenderingContext.prototype, 'drawArrays').and.callThrough();
      component.still = true;
      component.ngAfterViewInit();
      frame(1000);
      frame(1016);
      frame(1033);
      // One held frame, at full resolution, and nothing after it.
      expect(draws).toHaveBeenCalledTimes(1);
      expect(canvas.width).toBe(Math.round(64 * dpr));

      component.setStill(false);
      expect(component.still).toBeFalse();
      frame(1050);
      frame(1066);
      expect(draws).toHaveBeenCalledTimes(3);
    });

    it('only re-enters the zone for stats when somebody listens', () => {
      component.ngAfterViewInit();
      zone.run.calls.reset();
      for (let i = 0; i < 12; i++) frame(1000 + i * 16);
      expect(zone.run).not.toHaveBeenCalled();

      const stats = jasmine.createSpy('stats');
      component.stats.subscribe(stats);
      for (let i = 12; i < 24; i++) frame(1000 + i * 16);
      expect(zone.run).toHaveBeenCalled();
      expect(stats).toHaveBeenCalled();
    });
  });
});
