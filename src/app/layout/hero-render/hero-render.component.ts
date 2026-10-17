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
import { MotionPreference } from '../../gfx/motion-preference';
import { PlayStateService } from '../../play-state.service';
import { readThemeColor, srgbToLinear, type Rgb } from '../../gfx/color';
import { readPalette, type PaletteUniforms } from '../../gfx/palette';
import type { FrameStats, GpuCapabilities } from '../../gfx/shader-surface';
import type { UniformValue } from '../../gfx/shader';

const ACCENT_FALLBACK: Rgb = [0.55, 0.36, 0.96];

/**
 * The hero background: a raymarched terrain driven by pointer and scroll,
 * with the frame-time HUD reading off the same timer that drives its dynamic
 * resolution.
 *
 * The HUD's play/pause control decides whether the scene moves. Until the
 * visitor uses it, prefers-reduced-motion does (see MotionPreference).
 * Paused, both surfaces hold their picture.
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

  /** False holds both surfaces on their current frame. */
  motion = true;
  /** Motion is off only because the system asks for reduced motion; the HUD says so. */
  motionHeldBySystem = false;
  private readonly motionPreference: MotionPreference | null = null;

  stats: FrameStats | null = null;
  caps: GpuCapabilities | null = null;
  gpuName = '';
  failed = false;

  private accent = srgbToLinear(ACCENT_FALLBACK);
  /** --gfx-* tokens as linear uniforms; re-read on every theme switch. */
  private palette: PaletteUniforms = readPalette(true);
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
  /** scrollVh as the field last drew it; it holds while paused. */
  private fieldScroll = 0;
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
    if (this.isBrowser) {
      // Settled before the first render, so a surface that should start held
      // never draws a moving frame first.
      this.motionPreference = new MotionPreference(() => {
        this.syncMotion();
        this.cdr.markForCheck();
      });
      this.syncMotion();
    }
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
      // A page opened part-way down starts from there rather than easing in,
      // and a paused one holds the right picture for it.
      this.scroll = this.scrollTarget;
      this.fieldScroll = this.scrollVh;
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
    this.palette = readPalette(isDark);
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

  /** The HUD's play/pause control. */
  toggleMotion(): void {
    this.motionPreference?.toggle();
    this.syncMotion();
  }

  private syncMotion(): void {
    const preference = this.motionPreference;
    if (!preference) return;
    this.motion = preference.enabled;
    this.motionHeldBySystem = preference.heldBySystem;
  }

  /**
   * Shared per-frame smoothing for inputs both layers consume.
   *
   * Paused, nothing advances: every input that moves the camera or the map
   * holds where it was, so the uniforms stop changing and the surfaces stop
   * redrawing (the paused surfaces' clocks hold too). A theme switch still
   * changes the palette and gets one fresh frame. Playing again picks up from
   * the held values, so nothing jumps.
   */
  private advance(delta: number): void {
    if (!this.motion) return;
    // Frame-rate independent smoothing: 1 - e^(-k·dt) rather than a fixed lerp
    // factor, so the camera feels identical at 60Hz and 144Hz.
    const k = delta > 0 ? 1 - Math.exp(-9 * delta) : 1;
    this.pointer[0] += (this.pointerTarget[0] - this.pointer[0]) * k;
    this.pointer[1] += (this.pointerTarget[1] - this.pointer[1]) * k;
    this.scroll += (this.scrollTarget - this.scroll) * k;
    this.fieldScroll = this.scrollVh;
  }

  readonly fieldUniforms = (elapsed: number, delta: number): Record<string, UniformValue> => {
    this.advance(delta);
    return {
      ...this.palette,
      uTime: elapsed,
      uMouse: this.pointer,
      uScroll: this.fieldScroll,
      uAccent: this.accent,
      uTheme: this.theme,
    };
  };

  readonly uniformProvider = (elapsed: number, delta: number): Record<string, UniformValue> => {
    this.advance(delta);

    return {
      ...this.palette,
      uTime: elapsed,
      uMouse: this.pointer,
      uScroll: this.scroll,
      uAccent: this.accent,
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

  onReady(caps: GpuCapabilities, surface: GpuSurfaceComponent): void {
    this.caps = caps;
    // Read from the surface that emitted, not the @ViewChild: the surface sits
    // inside *ngIf and emits from its own ngAfterViewInit, before this
    // component's view query is populated — reading the query left the HUD
    // stuck on "detecting…".
    this.gpuName = surface.gpuName;
    // Same reason: a page loaded below the hero has already parked the
    // terrain in the scroll handler, before the surface existed.
    surface.setActive(this.active);
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
    this.motionPreference?.dispose();
  }
}
