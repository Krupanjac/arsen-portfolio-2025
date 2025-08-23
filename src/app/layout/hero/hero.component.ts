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

    let stars: Array<{ x: number; y: number; radius: number; vx: number; vy: number }> = [];
    const createStars = () => {
      stars = [];
      const starCount = window.innerWidth > 500
        ? Math.floor(Math.random() * 50 + 100)
        : Math.floor(Math.random() * 40 + 20);
      for (let i = 0; i < starCount; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 1 + 1,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2
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
        if (star.x < 0 || star.x > canvas.width) {
          star.vx *= -1;
        }
        if (star.y < 0 || star.y > canvas.height) {
          star.vy *= -1;
        }
      });
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