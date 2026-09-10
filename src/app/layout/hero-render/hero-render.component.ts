import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Inject,
  Input,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { GpuSurfaceComponent } from '../../gfx/gpu-surface/gpu-surface.component';
import { FrameHudComponent } from '../../gfx/frame-hud/frame-hud.component';
import { HERO_TERRAIN_FRAGMENT } from '../../gfx/shaders/hero-terrain.frag';
import { CONTOUR_FIELD_FRAGMENT } from '../../gfx/shaders/contour-field.frag';
import { prefersReducedMotion } from '../../gfx/render-loop';
import { PlayStateService } from '../../play-state.service';
import { readThemeColor, srgbToLinear, type Rgb } from '../../gfx/color';
import type { FrameStats, GpuCapabilities } from '../../gfx/shader-surface';
import type { UniformValue } from '../../gfx/shader';

const ACCENT_FALLBACK: Rgb = [0.55, 0.36, 0.96];
const SKY_DARK: Rgb = [0.031, 0.039, 0.063];
const SKY_LIGHT: Rgb = [0.62, 0.68, 0.80];

/**
 * The hero background: a raymarched terrain driven by pointer and scroll,
 * with the frame-time HUD reading off the same timer that drives its dynamic
 * resolution.
 *
 * Falls back to a static CSS gradient when WebGL2 is unavailable or the shader
 * fails to compile — the hero copy has to stay legible either way.
 */
@Component({
  selector: 'app-hero-render',
  standalone: true,
  imports: [CommonModule, GpuSurfaceComponent, FrameHudComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hero-render.component.html',
  styleUrls: ['./hero-render.component.scss'],
})
export class HeroRenderComponent implements AfterViewInit, OnDestroy {
  @ViewChild('terrain') terrain?: GpuSurfaceComponent;
  @ViewChild('field') field?: GpuSurfaceComponent;

  /** Hides the HUD when the hero is used purely as a backdrop. */
  @Input() showHud = true;

  readonly fragmentSource = HERO_TERRAIN_FRAGMENT;
  readonly fieldSource = CONTOUR_FIELD_FRAGMENT;
  private readonly reducedMotion = prefersReducedMotion();

  stats: FrameStats | null = null;
  caps: GpuCapabilities | null = null;
  gpuName = '';
  failed = false;

  private accent = srgbToLinear(ACCENT_FALLBACK);
  private sky = SKY_DARK;
  private theme = 1;

  // Pointer is stored as a target and chased by an exponential smoother in the
  // uniform provider — feeding raw pointer coordinates into a camera reads as
  // jitter at 60Hz, and mouse events do not arrive on frame boundaries anyway.
  private pointerTarget: [number, number] = [0, 0];
  private pointer: [number, number] = [0, 0];
  private scrollTarget = 0;
  private scroll = 0;
  /** Unbounded scroll in viewport heights — the field's parallax input. */
  private scrollVh = 0;
  private fieldActive = false;

  private themeObserver: MutationObserver | null = null;
  private active = true;
  private readonly isBrowser: boolean;

  constructor(
    @Inject(PLATFORM_ID) platformId: Object,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private host: ElementRef<HTMLElement>,
    private playState: PlayStateService,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    this.readTheme();
    this.zone.runOutsideAngular(() => {
      window.addEventListener('pointermove', this.onPointerMove, { passive: true });
      window.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
      window.addEventListener('scroll', this.onScroll, { passive: true });
      window.addEventListener('keydown', this.onKeyDown);
      this.onScroll();
    });
    // The theme toggle flips a data attribute on <html>; the shader needs to
    // hear about it without polling a computed style every frame.
    this.themeObserver = new MutationObserver(() => this.readTheme());
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  private readTheme(): void {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    this.theme = isDark ? 1 : 0;
    this.accent = srgbToLinear(readThemeColor('--color-accent', ACCENT_FALLBACK));
    this.sky = srgbToLinear(isDark ? SKY_DARK : SKY_LIGHT);
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    this.pointerTarget[0] = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointerTarget[1] = (event.clientY / window.innerHeight) * -2 + 1;
  };

  private readonly onPointerLeave = () => {
    this.pointerTarget[0] = 0;
    this.pointerTarget[1] = 0;
  };

  private readonly onScroll = () => {
    const h = window.innerHeight || 1;
    const y = window.scrollY || 0;
    this.scrollTarget = Math.min(1, Math.max(0, y / h));

    // The canvas is fixed, so it stays behind every section below the hero.
    // Fade it into the page background as the reader leaves, then park the
    // loop entirely — a shader this heavy has no business running while
    // somebody is reading the experience timeline.
    this.scrollVh = y / h;
    const veil = Math.min(1, Math.max(0, (y - h * 0.35) / (h * 0.65)));
    this.host.nativeElement.style.setProperty('--stage-veil', veil.toFixed(3));

    const shouldRun = y < h * 1.35;
    if (shouldRun !== this.active) {
      this.active = shouldRun;
      this.terrain?.setActive(shouldRun);
    }

    // The field only exists where the veil does; below 1% it is invisible and
    // there is no reason to spend a frame on it.
    const fieldShouldRun = veil > 0.01;
    if (fieldShouldRun !== this.fieldActive) {
      this.fieldActive = fieldShouldRun;
      this.field?.setActive(fieldShouldRun);
    }
  };

  /**
   * Quality controls, active only in fullscreen (play) mode where the renderer
   * is the whole page: 1 / 2 / 3 pin the internal resolution at 50 / 75 / 100%,
   * A hands it back to the dynamic scaler. Handy for reading the HUD at a known
   * cost instead of a moving one.
   */
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (!this.playState.isPlaying || !this.terrain) return;
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    switch (event.key) {
      case '1': this.terrain.setQualityLock(0.5); break;
      case '2': this.terrain.setQualityLock(0.75); break;
      case '3': this.terrain.setQualityLock(1); break;
      case 'a':
      case 'A':
      case '0': this.terrain.setQualityLock(null); break;
      case 'Escape':
        this.terrain.setQualityLock(null);
        this.zone.run(() => { this.playState.isPlaying = false; });
        break;
      default: return;
    }
  };

  /** Shared per-frame smoothing for inputs both layers consume. */
  private advance(delta: number): void {
    // Frame-rate independent smoothing: 1 - e^(-k·dt) rather than a fixed lerp
    // factor, so the camera feels identical at 60Hz and 144Hz.
    const k = delta > 0 ? 1 - Math.exp(-9 * delta) : 1;
    this.pointer[0] += (this.pointerTarget[0] - this.pointer[0]) * k;
    this.pointer[1] += (this.pointerTarget[1] - this.pointer[1]) * k;
    this.scroll += (this.scrollTarget - this.scroll) * k;
  }

  readonly fieldUniforms = (elapsed: number, delta: number): Record<string, UniformValue> => {
    this.advance(delta);
    return {
      uTime: this.reducedMotion ? 0 : elapsed,
      uMouse: this.pointer,
      uScroll: this.scrollVh,
      uAccent: this.accent,
      uTheme: this.theme,
    };
  };

  onFieldReady(): void {
    // Eleven noise taps a pixel does not need dynamic resolution; pin it at a
    // scale where the ink is soft enough to sit behind text.
    this.field?.setQualityLock(0.7);
  }

  readonly uniformProvider = (elapsed: number, delta: number): Record<string, UniformValue> => {
    this.advance(delta);

    return {
      uTime: this.reducedMotion ? 0 : elapsed,
      uMouse: this.pointer,
      uScroll: this.scroll,
      uAccent: this.accent,
      uSky: this.sky,
      uTheme: this.theme,
      // Quality tracks the resolution scaler: when the scaler has already
      // dropped resolution the GPU is struggling, so shedding march steps too
      // recovers far more than pixels alone.
      uQuality: this.stats
        ? Math.min(1, Math.max(0, (this.stats.renderScale - 0.45) / 0.55))
        : 1,
    };
  };

  onStats(stats: FrameStats): void {
    this.stats = stats;
    this.cdr.markForCheck();
  }

  onReady(caps: GpuCapabilities): void {
    this.caps = caps;
    this.gpuName = this.terrain?.gpuName ?? '';
    this.cdr.markForCheck();
  }

  onFailed(error: Error): void {
    console.warn('[hero] falling back to static background:', error.message);
    this.failed = true;
    this.cdr.markForCheck();
  }

  readonly historyProvider = (out: Float32Array): number =>
    this.terrain?.frameHistory(out) ?? 0;

  ngOnDestroy(): void {
    if (!this.isBrowser) return;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('keydown', this.onKeyDown);
    this.themeObserver?.disconnect();
  }
}
