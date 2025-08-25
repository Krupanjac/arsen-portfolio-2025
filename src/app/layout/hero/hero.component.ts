import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, ViewEncapsulation } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TerminalTypingDirective } from '../../shared/terminal-typing.directive';

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [TranslateModule, TerminalTypingDirective],
  templateUrl: './hero.component.html',
  styleUrls: ['./hero.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class HeroComponent implements OnInit, OnDestroy {
  private originalName = 'Đurđev';
  private animationFrameId: number | null = null;
  private randomSymbolsIntervalId: any = null;
  private resizeCanvasFn: (() => void) | null = null;
  // Scroll interaction
  private lastScrollY = 0;
  private scrollVelocity = 0;
  private scrollListener: (() => void) | null = null;
  // Mouse / pointer interactivity
  private mouseX = 0;
  private mouseY = 0;
  private mouseActive = false;
  private mouseMoveListener: ((e: Event) => void) | null = null;
  private pointerOutListener: (() => void) | null = null;
  private clickListener: ((e: MouseEvent) => void) | null = null;
  private particles: Array<{ x: number; y: number; vx: number; vy: number; life: number; r: number; color: string }> = [];
  private twinklePhase = 0;
  // Removed custom cursor & mouse trail properties

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    // Random delay before initializing effects
    const delay = Math.random() * 500 + 100;
    setTimeout(() => {
      this.initializeEffects();
    }, delay);
  }

  ngOnDestroy(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.randomSymbolsIntervalId !== null) {
      clearInterval(this.randomSymbolsIntervalId);
    }
    if (this.resizeCanvasFn) {
      window.removeEventListener('resize', this.resizeCanvasFn);
    }
    if (this.scrollListener) {
      window.removeEventListener('scroll', this.scrollListener);
    }
    if (this.mouseMoveListener) {
      window.removeEventListener('mousemove', this.mouseMoveListener as any);
    }
    if (this.pointerOutListener) {
      window.removeEventListener('pointerleave', this.pointerOutListener as any);
    }
    if (this.clickListener) {
      window.removeEventListener('click', this.clickListener as any);
    }
  // Removed mouse listeners and droplet animation cleanup
  }

  private initializeEffects(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

  // Removed custom cursor & droplet trail initialization

    // Name Randomization Effect
    this.randomSymbolsIntervalId = setInterval(() => this.randomSymbols(), 1000);

    // Canvas Setup for Starfield Animation
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

  // Added baseVx/baseVy to remember original (cruise) speed for easing after bounces
    // devicePixelRatio aware backing store to keep canvas crisp on high-DPI/mobile displays
    let dpr = 1;
    let stars: Array<{ x: number; y: number; radius: number; vx: number; vy: number; baseVx: number; baseVy: number; baseRadius?: number }> = [];
    const createStars = () => {
      stars = [];
      // use logical (CSS) width/height for star placement; canvas.width/height are physical pixels
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const starCount = w > 500
        ? Math.floor(Math.random() * 50 + 100)
        : Math.floor(Math.random() * 40 + 20);
      for (let i = 0; i < starCount; i++) {
        const vx = (Math.random() - 0.5) * 2;
        const vy = (Math.random() - 0.5) * 2;
        const r = Math.random() * 1 + 1;
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          radius: r,
          baseRadius: r,
          vx,
          vy,
          baseVx: vx,
          baseVy: vy
        });
      }
    };
    // resolve accent color here so event handlers can reuse it; support light theme
    const resolvedAccent = () => {
      // prefer system light theme: force black in light mode
      const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      if (prefersLight) return '#000000';
      // CSS variable takes precedence for non-light themes
      const css = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
      if (css) return css;
      // default for dark/unknown
      return '#482268';
    };
    let accent = resolvedAccent();

    const draw = () => {
      // clear using logical size (after ctx transform we'll draw in CSS pixels)
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.clearRect(0, 0, w, h);
  // accent color resolved from outer scope; refresh each frame in case theme changes
  accent = resolvedAccent();
  ctx.fillStyle = accent;
      // helper: convert #RRGGBB to rgba(r,g,b,a)
      const hexToRgba = (hex: string, a: number) => {
        if (!hex) return `rgba(139,92,246,${a})`;
        // accept #rgb or #rrggbb, with or without leading '#'
        let h = hex.trim();
        if (h.charAt(0) === '#') h = h.slice(1);
        if (/^[0-9a-fA-F]{3}$/.test(h)) {
          const r = parseInt(h[0] + h[0], 16);
          const g = parseInt(h[1] + h[1], 16);
          const b = parseInt(h[2] + h[2], 16);
          return `rgba(${r},${g},${b},${a})`;
        }
        if (/^[0-9a-fA-F]{6}$/.test(h)) {
          const r = parseInt(h.slice(0, 2), 16);
          const g = parseInt(h.slice(2, 4), 16);
          const b = parseInt(h.slice(4, 6), 16);
          return `rgba(${r},${g},${b},${a})`;
        }
        // fallback: if it's already rgb/rgba, try to inject alpha
        const rgbm = /^rgba?\(([^)]+)\)$/.exec(hex);
        if (rgbm) {
          const parts = rgbm[1].split(',').map(p => p.trim());
          if (parts.length >= 3) {
            const r = parts[0], g = parts[1], b = parts[2];
            return `rgba(${r},${g},${b},${a})`;
          }
        }
        // last resort: return a sensible purple-ish fallback
        return `rgba(139,92,246,${a})`;
      };

  stars.forEach(star => {
        const sSpeed = Math.sqrt(star.vx * star.vx + star.vy * star.vy);
        // Only show a small glow at low speeds; glow ramps up after threshold
        const sThreshold = 0.5; // speeds below this show minimal glow
        const sMaxSpeed = 4.0; // speed that maps to max glow
        const sMinGlow = 0.8; // minimal glow radius
        const sMaxGlow = 28; // maximal glow radius
        const sFactor = Math.max(0, Math.min(1, (sSpeed - sThreshold) / (sMaxSpeed - sThreshold)));
        const sGlowSize = sMinGlow + sFactor * (sMaxGlow - sMinGlow);

        // gradient glow using accent color (fallback handled)
        const ggrad = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.radius + sGlowSize);
        const a0 = 0.85 * Math.max(0.3, sFactor); // inner alpha slightly tied to speed for stronger glow when fast
        const a1 = 0.16 * (0.6 + sFactor * 0.8);
        const accentInner = /^#([0-9a-fA-F]{6})$/.test(accent) ? hexToRgba(accent, a0) : 'rgba(139,92,246,' + a0 + ')';
        const accentMid = /^#([0-9a-fA-F]{6})$/.test(accent) ? hexToRgba(accent, a1) : 'rgba(139,92,246,' + a1 + ')';
        ggrad.addColorStop(0, accentInner);
        ggrad.addColorStop(0.35, accentMid);
        ggrad.addColorStop(1, 'rgba(0,0,0,0)');

        // draw additive glow behind star (subtle at normal speeds)
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = ggrad as any;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius + sGlowSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // draw star core on top
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.save();
        ctx.globalAlpha = 0.9 + 0.1 * Math.sin(this.twinklePhase + (star.x + star.y) * 0.001);
        ctx.fillStyle = accent as any;
        ctx.fill();
        ctx.restore();
      });
  ctx.beginPath();
      // Apply 0.6 alpha to accent for connecting lines; prefer hex->rgba
      let accentStroke = accent;
      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(accent)) {
        accentStroke = hexToRgba(accent, 0.6);
      } else {
        // try to convert rgb(...) or fallback to purple-ish
        accentStroke = /^rgba?\(/.test(accent) ? accent.replace(/rgba?\(([^)]+)\)/, (_, inner) => `rgba(${inner.split(',').slice(0,3).join(',')},0.6)`) : 'rgba(139,92,246,0.6)';
      }
      ctx.strokeStyle = accentStroke;
      ctx.lineWidth = 0.3;
      stars.forEach((a, i) => {
        stars.slice(i).forEach(b => {
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          }
        });
      });
      ctx.stroke();

      // Draw particles (click bursts)
      this.particles.forEach(p => {
        const alpha = Math.max(0, p.life / 60);
        // draw simple particle core only (no glow)
        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      // Draw subtle cursor glow when active
      if (this.mouseActive) {
        const g = ctx.createRadialGradient(this.mouseX, this.mouseY, 0, this.mouseX, this.mouseY, 120);
        const inner = hexToRgba(accent, 0.18);
        const outer = hexToRgba(accent, 0);
        g.addColorStop(0, inner as any);
        g.addColorStop(1, outer as any);
        ctx.fillStyle = g as any;
        ctx.fillRect(this.mouseX - 120, this.mouseY - 120, 240, 240);
      }
    };

    const update = () => {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      // advance twinkle
      this.twinklePhase += 0.03;
      stars.forEach(star => {
        star.x += star.vx;
        star.y += star.vy;
        // Apply scroll-induced parallax instantly (per-frame delta only)
        if (this.scrollVelocity !== 0) {
          star.y += -this.scrollVelocity * 0.05; // immediate effect
        }
        // Mouse interaction: gentle attraction toward pointer, with distance falloff
        if (this.mouseActive) {
          const dx = this.mouseX - star.x;
          const dy = this.mouseY - star.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 220 && dist > 0.0001) {
            // strength stronger when closer
            const strength = (1 - dist / 220) * 0.35; // tuned
            star.vx += (dx / dist) * strength;
            star.vy += (dy / dist) * strength;
          }
        }
        // subtle orbital noise for liveliness
        star.vx += (Math.cos((star.x + star.y + this.twinklePhase) * 0.002) - 0.5) * 0.0008;
        star.vy += (Math.sin((star.x + star.y + this.twinklePhase) * 0.002) - 0.5) * 0.0008;
    // Bounce with clamping (include radius to keep inside viewport)
  const scrollEnergy = Math.min(Math.abs(this.scrollVelocity), 300); // instantaneous energy (0..300)
  // Saturated scaling: linear earlier, flattens for large scrolls
  // normalized 0..1 then map to multiplier 1..(1+scaleRange)
  const normalized = scrollEnergy / 300; // 0..1
  const scaleRange = 2; // max added multiplier (old linear could reach +3)
  const energyFactor = 1 + (normalized / (1 + 1.5 * normalized)) * scaleRange; // soft saturation
  const maxSpeed = 4.5; // reduced top speed for gentler bounce

  if (star.x - star.radius < 0) {
          star.x = star.radius;
          star.vx = Math.min(Math.max(-star.vx * energyFactor, -maxSpeed), maxSpeed);
        } else if (star.x + star.radius > w) {
          star.x = w - star.radius;
          star.vx = Math.min(Math.max(-star.vx * energyFactor, -maxSpeed), maxSpeed);
        }
        if (star.y - star.radius < 0) {
          star.y = star.radius;
          star.vy = Math.min(Math.max(-star.vy * energyFactor, -maxSpeed), maxSpeed);
        } else if (star.y + star.radius > h) {
          star.y = h - star.radius;
          star.vy = Math.min(Math.max(-star.vy * energyFactor, -maxSpeed), maxSpeed);
        }

  // Ease velocities back toward their original (base) values for smooth slowdown
  // Only apply easing if current speed exceeds base speed noticeably to avoid perpetual tiny adjustments
  const relaxFactor = 0.002; // 0.2% per frame
  star.vx += (star.baseVx - star.vx) * relaxFactor;
  star.vy += (star.baseVy - star.vy) * relaxFactor;
        // twinkle radius easing toward baseRadius
        if ((star as any).baseRadius !== undefined) {
          star.radius += (((star as any).baseRadius) - star.radius) * 0.03;
          // slight per-star twinkle modulation
          star.radius = (star as any).baseRadius * (0.85 + 0.3 * Math.abs(Math.sin(this.twinklePhase + star.x * 0.001)));
        }
      });
  // Reset scroll velocity so only new wheel events affect next frame
  this.scrollVelocity = 0;

      // update particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.life -= 1;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
    };

    const animate = () => {
      update();
      draw();
      this.animationFrameId = requestAnimationFrame(animate);
    };

    this.resizeCanvasFn = () => {
      // respect devicePixelRatio for crisp rendering on mobile/retina
      const newDpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
      dpr = newDpr;
      // set physical canvas size
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      // set css size to match layout
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      // reset transform and scale context so all drawing uses logical (CSS) coordinates
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // recreate stars so positions match new logical size
      createStars();
    };
    window.addEventListener('resize', this.resizeCanvasFn);
    this.resizeCanvasFn();
    // Scroll listener to adjust parallax speed
    this.lastScrollY = window.scrollY;
    this.scrollListener = () => {
      const current = window.scrollY;
      const delta = current - this.lastScrollY; // positive when scrolling down
      this.lastScrollY = current;
      this.scrollVelocity += delta; // collect deltas between frames
      const max = 300;
      if (this.scrollVelocity > max) this.scrollVelocity = max;
      if (this.scrollVelocity < -max) this.scrollVelocity = -max;
    };
    window.addEventListener('scroll', this.scrollListener, { passive: true });

    // Pointer move: interactive attraction + cursor glow
    this.mouseMoveListener = (e: Event) => {
      const ev = e as MouseEvent;
      this.mouseX = ev.clientX;
      this.mouseY = ev.clientY;
      this.mouseActive = true;
    };
    this.pointerOutListener = () => { this.mouseActive = false; };
    window.addEventListener('mousemove', this.mouseMoveListener, { passive: true });
    window.addEventListener('pointerleave', this.pointerOutListener);

    // Click: particle burst
    this.clickListener = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const count = Math.min(18, 6 + Math.floor(Math.random() * 12));
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 3;
  const color = Math.random() > 0.5 ? accent : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? '#222' : '#fff');
        this.particles.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 30 + Math.floor(Math.random() * 40), r: 1 + Math.random() * 3, color });
        if (this.particles.length > 300) this.particles.splice(0, this.particles.length - 300);
      }
    };
    window.addEventListener('click', this.clickListener);
    animate();
  }

  // Removed droplet creation & animation methods

  private randomSymbols(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const symbols = "!@#$%^&*()-_=+[]{}|;:,.<>?";
    const suNameEl = document.getElementById('su_name');
    if (!suNameEl) {
      return;
    }
    const nameArray = this.originalName.split('');
    const indices = new Set<number>();
    while (indices.size < 2) {
      indices.add(Math.floor(Math.random() * nameArray.length));
    }
    indices.forEach(i => {
      nameArray[i] = symbols[Math.floor(Math.random() * symbols.length)];
    });
    suNameEl.textContent = nameArray.join('');
  }
}