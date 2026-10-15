import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Inject,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  PLATFORM_ID,
  Renderer2,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import type { FrameStats, GpuCapabilities } from '../shader-surface';

/**
 * At or below this rendered opacity the HUD counts as hidden. The hero fades
 * it out with its scroll veil; past this point nobody can read it, so it
 * should not be reachable or burning frames either.
 */
const HIDDEN_OPACITY = 0.05;

/**
 * Live frame-time readout for the hero renderer.
 *
 * This is a real instrument, not a decoration: the numbers come from the same
 * FrameTimer that drives dynamic resolution, GPU time is an actual timer query
 * where the extension exists, and the graph is frame time against the 60Hz
 * budget rather than a smoothed FPS counter that hides every hitch.
 *
 * The graph only draws while the HUD can be seen: every frame normally, or
 * once per stats update under prefers-reduced-motion. Once the hero has faded
 * it out, the HUD is inert and hidden from assistive tech until it returns.
 */
@Component({
  selector: 'app-frame-hud',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './frame-hud.component.html',
  styleUrls: ['./frame-hud.component.scss'],
})
export class FrameHudComponent implements OnChanges, AfterViewInit, OnDestroy {
  @ViewChild('graph') graphRef?: ElementRef<HTMLCanvasElement>;

  @Input() stats: FrameStats | null = null;
  @Input() caps: GpuCapabilities | null = null;
  @Input() gpuName = '';
  /** Fills the passed buffer with recent frame times; returns the count. */
  @Input() historyProvider: ((out: Float32Array) => number) | null = null;

  expanded = false;

  private readonly buffer = new Float32Array(120);
  /** The pending draw: the per-frame loop, or a single reduced-motion redraw. */
  private raf = 0;
  private visibilityRaf = 0;
  private visible = true;
  private viewReady = false;
  private readonly reducedMotion: boolean;
  private readonly isBrowser: boolean;

  constructor(
    @Inject(PLATFORM_ID) platformId: Object,
    private zone: NgZone,
    private host: ElementRef<HTMLElement>,
    private renderer: Renderer2,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.reducedMotion =
      this.isBrowser && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  toggle(): void {
    this.expanded = !this.expanded;
  }

  ngOnChanges(changes: SimpleChanges): void {
    // No continuous loop under reduced motion: the graph follows the stats
    // instead, which the renderer reports a few times a second at most.
    if (changes['stats'] && this.reducedMotion) this.requestDraw();
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    this.viewReady = true;
    const host = this.host.nativeElement;
    this.zone.runOutsideAngular(() => {
      // The hero fades this element with its scroll veil. Scroll moves the
      // veil; transitionend catches where the fade actually comes to rest.
      window.addEventListener('scroll', this.onViewportChange, { passive: true });
      host.addEventListener('transitionend', this.onTransition);
      host.addEventListener('transitioncancel', this.onTransition);
      this.scheduleVisibilityCheck();
    });
    this.syncLoop();
    if (this.reducedMotion) this.requestDraw();
  }

  private readonly onViewportChange = () => this.scheduleVisibilityCheck();

  private readonly onTransition = (event: TransitionEvent) => {
    if (event.target === this.host.nativeElement && event.propertyName === 'opacity') {
      this.scheduleVisibilityCheck();
    }
  };

  /**
   * Rendered opacity is the honest signal for "hidden": it is what the reader
   * sees. Read at most once a frame, and a frame late, so the hero's own scroll
   * handler has already moved the veil by the time it is measured.
   */
  private scheduleVisibilityCheck(): void {
    if (this.visibilityRaf) return;
    this.visibilityRaf = requestAnimationFrame(() => {
      this.visibilityRaf = 0;
      const opacity = parseFloat(getComputedStyle(this.host.nativeElement).opacity);
      this.setVisible(Number.isNaN(opacity) || opacity > HIDDEN_OPACITY);
    });
  }

  private setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    const host = this.host.nativeElement;
    if (visible) {
      this.renderer.removeAttribute(host, 'inert');
      this.renderer.removeAttribute(host, 'aria-hidden');
    } else {
      // Faded out, so out of the tab order, the accessibility tree and
      // hit-testing too: an invisible HUD must not swallow clicks meant for
      // the section underneath it. Drop focus first so it never sits inside
      // an aria-hidden subtree.
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && host.contains(focused)) focused.blur();
      this.renderer.setAttribute(host, 'inert', '');
      this.renderer.setAttribute(host, 'aria-hidden', 'true');
    }
    this.syncLoop();
    // The graph went stale while hidden; bring it up to date once.
    if (visible && this.reducedMotion) this.requestDraw();
  }

  /** Runs the per-frame loop only while it is visible and motion is welcome. */
  private syncLoop(): void {
    const shouldRun = this.viewReady && this.visible && !this.reducedMotion;
    if (shouldRun && !this.raf) {
      this.zone.runOutsideAngular(() => {
        const tick = () => {
          this.draw();
          this.raf = requestAnimationFrame(tick);
        };
        this.raf = requestAnimationFrame(tick);
      });
    } else if (!shouldRun && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  /** A single redraw on the next frame, for the reduced-motion path. */
  private requestDraw(): void {
    if (!this.isBrowser || !this.visible || this.raf) return;
    this.zone.runOutsideAngular(() => {
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.draw();
      });
    });
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
    if (!this.isBrowser) return;
    const host = this.host.nativeElement;
    window.removeEventListener('scroll', this.onViewportChange);
    host.removeEventListener('transitionend', this.onTransition);
    host.removeEventListener('transitioncancel', this.onTransition);
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.visibilityRaf) cancelAnimationFrame(this.visibilityRaf);
    this.raf = 0;
    this.visibilityRaf = 0;
  }
}
