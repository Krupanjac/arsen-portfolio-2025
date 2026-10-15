import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Inject,
  Input,
  NgZone,
  OnDestroy,
  Output,
  PLATFORM_ID,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ShaderSurface, type FrameStats, type GpuCapabilities } from '../shader-surface';
import type { UniformValue } from '../shader';

export type UniformProvider = (elapsed: number, delta: number) => Record<string, UniformValue>;

/**
 * Angular wrapper around ShaderSurface.
 *
 * The render loop runs outside the Angular zone — a zone-aware rAF would fire
 * change detection 60 times a second for a canvas that Angular does not own a
 * single pixel of. Only the throttled stats emission re-enters.
 */
@Component({
  selector: 'app-gpu-surface',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas
      #surface
      class="block w-full h-full"
      [attr.aria-hidden]="true"
      data-gpu-surface
    ></canvas>
    <ng-content></ng-content>
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        /* The canvas is decorative; never let it eat pointer events from the
           content layered over it. */
        pointer-events: none;
      }
    `,
  ],
})
export class GpuSurfaceComponent implements AfterViewInit, OnDestroy {
  @ViewChild('surface', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input({ required: true }) fragmentSource!: string;
  @Input({ required: true }) uniformProvider!: UniformProvider;
  @Input() targetFps = 60;
  @Input() maxDpr = 2;
  /**
   * GPU selection hint, read once at creation. 'high-performance' forces the
   * discrete GPU on a dual-GPU laptop (and its battery cost); opt in only
   * where a surface cannot hold its frame rate without it.
   */
  @Input() powerPreference: WebGLPowerPreference = 'default';

  /**
   * Same as setActive(). As an input it also sets the state the loop starts
   * in, so a surface that should begin parked never renders a frame first.
   */
  @Input()
  get active(): boolean {
    return this.activeState;
  }
  set active(value: boolean) {
    this.setActive(value);
  }

  /** Same as setQualityLock(), declaratively; safe to bind before the surface exists. */
  @Input()
  get qualityLock(): number | null {
    return this.lockState;
  }
  set qualityLock(value: number | null) {
    this.setQualityLock(value);
  }

  @Output() stats = new EventEmitter<FrameStats>();
  @Output() ready = new EventEmitter<GpuCapabilities>();
  @Output() failed = new EventEmitter<Error>();

  private surface: ShaderSurface | null = null;
  private activeState = true;
  private lockState: number | null = null;
  private readonly isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: Object, private zone: NgZone) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    this.zone.runOutsideAngular(() => {
      const surface = new ShaderSurface(this.canvasRef.nativeElement, {
        fragmentSource: this.fragmentSource,
        uniforms: (elapsed, delta) => this.uniformProvider(elapsed, delta),
        targetFps: this.targetFps,
        maxDpr: this.maxDpr,
        powerPreference: this.powerPreference,
        // Re-entering the zone runs change detection for the whole app; a
        // surface nobody reads stats from should not pay for that 6x a second.
        onStats: (s) => {
          if (this.stats.observed) this.zone.run(() => this.stats.emit(s));
        },
        onReady: (caps) => this.zone.run(() => this.ready.emit(caps)),
        onError: (err) => this.zone.run(() => this.failed.emit(err)),
      });
      // Whatever the owner asked for before the view existed holds from the
      // first frame.
      surface.setActive(this.activeState);
      if (this.lockState !== null) surface.setQualityLock(this.lockState);
      this.surface = surface;
      surface.init();
    });
  }

  /** Fills `out` with recent frame times, oldest first; returns the count. */
  frameHistory(out: Float32Array): number {
    return this.surface?.frameHistory(out) ?? 0;
  }

  /** Park or resume the loop. See ShaderSurface.setActive. Remembered if called early. */
  setActive(active: boolean): void {
    this.activeState = active;
    this.surface?.setActive(active);
  }

  /**
   * Pass a scale in [0.45, 1] to pin resolution, or null to hand it back to
   * DRS. Remembered if called before the surface exists.
   */
  setQualityLock(scale: number | null): void {
    this.lockState = scale;
    this.surface?.setQualityLock(scale);
  }

  get gpuName(): string {
    return this.surface?.gpuName ?? '';
  }

  get capabilities(): GpuCapabilities | null {
    return this.surface?.capabilities ?? null;
  }

  ngOnDestroy(): void {
    this.surface?.dispose();
    this.surface = null;
  }
}
