import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, ViewEncapsulation } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './hero.component.html',
  styleUrls: ['./hero.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class HeroComponent implements OnInit, OnDestroy {
  private originalName = 'Đuđev';
  private animationFrameId: number | null = null;
  private randomSymbolsIntervalId: any = null;
  private resizeCanvasFn: (() => void) | null = null;
  // Scroll interaction
  private lastScrollY = 0;
  private scrollVelocity = 0;
  private scrollListener: (() => void) | null = null;
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
  let stars: Array<{ x: number; y: number; radius: number; vx: number; vy: number; baseVx: number; baseVy: number }> = [];
    const createStars = () => {
      stars = [];
      const starCount = window.innerWidth > 500
        ? Math.floor(Math.random() * 50 + 100)
        : Math.floor(Math.random() * 40 + 20);
      for (let i = 0; i < starCount; i++) {
        const vx = (Math.random() - 0.5) * 2;
        const vy = (Math.random() - 0.5) * 2;
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 1 + 1,
          vx,
          vy,
          baseVx: vx,
          baseVy: vy
        });
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#482268';
      stars.forEach(star => {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.beginPath();
      ctx.strokeStyle = '#48226893';
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
    };

    const update = () => {
      stars.forEach(star => {
        star.x += star.vx;
        star.y += star.vy;
        // Apply scroll-induced parallax instantly (per-frame delta only)
        if (this.scrollVelocity !== 0) {
          star.y += -this.scrollVelocity * 0.05; // immediate effect
        }
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
        } else if (star.x + star.radius > canvas.width) {
          star.x = canvas.width - star.radius;
          star.vx = Math.min(Math.max(-star.vx * energyFactor, -maxSpeed), maxSpeed);
        }
        if (star.y - star.radius < 0) {
          star.y = star.radius;
          star.vy = Math.min(Math.max(-star.vy * energyFactor, -maxSpeed), maxSpeed);
        } else if (star.y + star.radius > canvas.height) {
          star.y = canvas.height - star.radius;
          star.vy = Math.min(Math.max(-star.vy * energyFactor, -maxSpeed), maxSpeed);
        }

  // Ease velocities back toward their original (base) values for smooth slowdown
  // Only apply easing if current speed exceeds base speed noticeably to avoid perpetual tiny adjustments
  const relaxFactor = 0.002; // 0.2% per frame
  star.vx += (star.baseVx - star.vx) * relaxFactor;
  star.vy += (star.baseVy - star.vy) * relaxFactor;
      });
  // Reset scroll velocity so only new wheel events affect next frame
  this.scrollVelocity = 0;
    };

    const animate = () => {
      update();
      draw();
      this.animationFrameId = requestAnimationFrame(animate);
    };

    this.resizeCanvasFn = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
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