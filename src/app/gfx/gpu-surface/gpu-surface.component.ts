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

  @Output() stats = new EventEmitter<FrameStats>();
  @Output() ready = new EventEmitter<GpuCapabilities>();
  @Output() failed = new EventEmitter<Error>();

  private surface: ShaderSurface | null = null;
  private readonly isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: Object, private zone: NgZone) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    this.zone.runOutsideAngular(() => {
      this.surface = new ShaderSurface(this.canvasRef.nativeElement, {
        fragmentSource: this.fragmentSource,
        uniforms: (elapsed, delta) => this.uniformProvider(elapsed, delta),
        targetFps: this.targetFps,
        maxDpr: this.maxDpr,
        onStats: (s) => this.zone.run(() => this.stats.emit(s)),
        onReady: (caps) => this.zone.run(() => this.ready.emit(caps)),
        onError: (err) => this.zone.run(() => this.failed.emit(err)),
      });
      this.surface.init();
    });
  }

  /** Fills `out` with recent frame times, oldest first; returns the count. */
  frameHistory(out: Float32Array): number {
    return this.surface?.frameHistory(out) ?? 0;
  }

  /** Park or resume the loop. See ShaderSurface.setActive. */
  setActive(active: boolean): void {
    this.surface?.setActive(active);
  }

  /** Pass a scale in [0.45, 1] to pin resolution, or null to hand it back to DRS. */
  setQualityLock(scale: number | null): void {
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
