import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Inject,
  Input,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import type { FrameStats, GpuCapabilities } from '../shader-surface';

/**
 * Live frame-time readout for the hero renderer.
 *
 * This is a real instrument, not a decoration: the numbers come from the same
 * FrameTimer that drives dynamic resolution, GPU time is an actual timer query
 * where the extension exists, and the graph is frame time against the 60Hz
 * budget rather than a smoothed FPS counter that hides every hitch.
 */
@Component({
  selector: 'app-frame-hud',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './frame-hud.component.html',
  styleUrls: ['./frame-hud.component.scss'],
})
export class FrameHudComponent implements AfterViewInit, OnDestroy {
  @ViewChild('graph') graphRef?: ElementRef<HTMLCanvasElement>;

  @Input() stats: FrameStats | null = null;
  @Input() caps: GpuCapabilities | null = null;
  @Input() gpuName = '';
  /** Fills the passed buffer with recent frame times; returns the count. */
  @Input() historyProvider: ((out: Float32Array) => number) | null = null;

  expanded = false;

  private readonly buffer = new Float32Array(120);
  private raf = 0;
  private readonly isBrowser: boolean;

  constructor(
    @Inject(PLATFORM_ID) platformId: Object,
    private zone: NgZone,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  toggle(): void {
    this.expanded = !this.expanded;
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    this.zone.runOutsideAngular(() => this.scheduleDraw());
  }

  private scheduleDraw(): void {
    const tick = () => {
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Colour band for a frame time: at budget, over budget, badly over. */
  private band(ms: number): string {
    if (ms <= 16.7) return 'rgba(140, 240, 190, 0.85)';
    if (ms <= 33.3) return 'rgba(240, 205, 120, 0.85)';
    return 'rgba(244, 130, 130, 0.9)';
  }

  private draw(): void {
    const canvas = this.graphRef?.nativeElement;
    if (!canvas || !this.historyProvider) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const count = this.historyProvider(this.buffer);
    if (count === 0) return;

    // Fixed 50ms ceiling. An auto-scaling axis makes a stable 60fps trace and a
    // stable 20fps trace look identical, which defeats the point.
    const ceiling = 50;
    const barW = w / this.buffer.length;

    // Budget line at 16.7ms.
    const budgetY = h - (16.7 / ceiling) * h;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, budgetY);
    ctx.lineTo(w, budgetY);
    ctx.stroke();
    ctx.setLineDash([]);

    const start = this.buffer.length - count;
    for (let i = 0; i < count; i++) {
      const ms = this.buffer[i];
      const barH = Math.max(1, Math.min(h, (ms / ceiling) * h));
      ctx.fillStyle = this.band(ms);
      ctx.fillRect((start + i) * barW, h - barH, Math.max(1, barW - 0.5), barH);
    }
  }

  format(value: number, digits = 1): string {
    if (!Number.isFinite(value)) return '--';
    return value.toFixed(digits);
  }

  get gpuMsLabel(): string {
    if (!this.stats) return '--';
    if (!Number.isFinite(this.stats.gpuMs)) return 'n/a';
    return this.stats.gpuMs.toFixed(2);
  }

  get scalePercent(): number {
    return Math.round((this.stats?.renderScale ?? 1) * 100);
  }

  get megaPixelsPerSecond(): string {
    if (!this.stats) return '--';
    return (this.stats.pixelsPerSecond / 1e6).toFixed(0);
  }

  ngOnDestroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
  }
}
