import { Component, OnInit, OnDestroy, AfterViewInit, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-background',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './background.component.html',
  styleUrl: './background.component.scss'
})
export class BackgroundComponent implements OnInit, AfterViewInit, OnDestroy {
  private animationFrameId: number | null = null;
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
  
  // Performance optimization: Cache frequently used values
  private cachedAccent = '';
  private lastAccentCheck = 0;
  private readonly ACCENT_CHECK_INTERVAL = 100;
  
  // Simplified caching - remove over-complex gradient caching
  private accentRgbaCache = new Map<string, string>();
  
  // Pre-calculated constants
  private readonly TWINKLE_SPEED = 0.03;
  private readonly SCROLL_DAMPING = 0.05;
  private readonly MOUSE_ATTRACTION_STRENGTH = 0.35;
  private readonly MOUSE_RANGE_SQ = 48400; // 220^2
  private readonly CONNECTION_RANGE_SQ = 22500; // 150^2
  private readonly NOISE_STRENGTH = 0.0008;
  private readonly RELAX_FACTOR = 0.002;
  private readonly MAX_SPEED = 4.5;
  private readonly MAX_PARTICLES = 300;

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

  ngAfterViewInit(): void {
    // No setup needed here for background
  }

  ngOnDestroy(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
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
    this.accentRgbaCache.clear();
  }

  private initializeEffects(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // Canvas Setup for Starfield Animation
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // Performance: Enable hardware acceleration hints
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';

    let dpr = 1;
    let stars: Array<{ 
      x: number; y: number; radius: number; vx: number; vy: number; 
      baseVx: number; baseVy: number; baseRadius: number;
      twinkleOffset: number; // Pre-calculate twinkle offset
    }> = [];
    
    const createStars = () => {
      stars = [];
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const starCount = w > 500
        ? Math.floor(Math.random() * 50 + 100)
        : Math.floor(Math.random() * 40 + 20);
      
      for (let i = 0; i < starCount; i++) {
        const vx = (Math.random() - 0.5) * 2;
        const vy = (Math.random() - 0.5) * 2;
        const r = Math.random() * 1 + 1;
        const x = Math.random() * w;
        const y = Math.random() * h;
        
        stars.push({
          x, y,
          radius: r,
          baseRadius: r,
          vx, vy,
          baseVx: vx,
          baseVy: vy,
          twinkleOffset: (x + y) * 0.001 // Pre-calculate this constant
        });
      }
    };

    // Simplified accent color resolution
    const resolvedAccent = () => {
      const now = Date.now();
      if (now - this.lastAccentCheck > this.ACCENT_CHECK_INTERVAL) {
        this.lastAccentCheck = now;
        const css = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
        if (css) {
          this.cachedAccent = css;
        } else {
          const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
          this.cachedAccent = prefersLight ? '#000000' : '#482268';
        }
      }
      return this.cachedAccent;
    };

    // Optimized hex to rgba conversion - simplified
    const hexToRgba = (hex: string, alpha: number): string => {
      const key = `${hex}-${alpha}`;
      if (this.accentRgbaCache.has(key)) {
        return this.accentRgbaCache.get(key)!;
      }

      let result: string;
      let h = hex.trim();
      if (h.charAt(0) === '#') h = h.slice(1);
      
      if (/^[0-9a-fA-F]{3}$/.test(h)) {
        const r = parseInt(h[0] + h[0], 16);
        const g = parseInt(h[1] + h[1], 16);
        const b = parseInt(h[2] + h[2], 16);
        result = `rgba(${r},${g},${b},${alpha})`;
      } else if (/^[0-9a-fA-F]{6}$/.test(h)) {
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        result = `rgba(${r},${g},${b},${alpha})`;
      } else {
        result = `rgba(139,92,246,${alpha})`; // fallback
      }

      this.accentRgbaCache.set(key, result);
      return result;
    };

    let accent = resolvedAccent();

    const draw = () => {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.clearRect(0, 0, w, h);
      
      accent = resolvedAccent();

      // Batch all glow operations
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      
      // Pre-calculate common values outside the loop
      const sThreshold = 0.5;
      const sMaxSpeed = 4.0;
      const sMinGlow = 0.8;
      const sMaxGlow = 28;
      const speedRange = sMaxSpeed - sThreshold;
      
      stars.forEach(star => {
        const sSpeed = Math.sqrt(star.vx * star.vx + star.vy * star.vy);
        const sFactor = Math.max(0, Math.min(1, (sSpeed - sThreshold) / speedRange));
        const sGlowSize = sMinGlow + sFactor * (sMaxGlow - sMinGlow);
        
        // Create gradient directly without complex caching
        const ggrad = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.radius + sGlowSize);
        const a0 = 0.85 * Math.max(0.3, sFactor);
        const a1 = 0.16 * (0.6 + sFactor * 0.8);
        
        ggrad.addColorStop(0, hexToRgba(accent, a0));
        ggrad.addColorStop(0.35, hexToRgba(accent, a1));
        ggrad.addColorStop(1, 'rgba(0,0,0,0)');
        
        ctx.fillStyle = ggrad;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius + sGlowSize, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      // Draw all star cores efficiently
      ctx.fillStyle = accent;
      ctx.beginPath();
      stars.forEach(star => {
        const alpha = 0.9 + 0.1 * Math.sin(this.twinklePhase + star.twinkleOffset);
        ctx.globalAlpha = alpha;
        ctx.moveTo(star.x + star.radius, star.y);
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      });
      ctx.fill();
      ctx.globalAlpha = 1;

      // Draw connections in one pass - simplified
      ctx.strokeStyle = hexToRgba(accent, 0.6);
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      
      for (let i = 0; i < stars.length; i++) {
        const a = stars[i];
        for (let j = i + 1; j < stars.length; j++) {
          const b = stars[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = dx * dx + dy * dy;
          
          if (distSq < this.CONNECTION_RANGE_SQ) {
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          }
        }
      }
      ctx.stroke();

      // Draw particles efficiently
      if (this.particles.length > 0) {
        this.particles.forEach(p => {
          ctx.globalAlpha = Math.max(0, p.life / 60);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }

      // Draw cursor glow
      if (this.mouseActive) {
        const g = ctx.createRadialGradient(this.mouseX, this.mouseY, 0, this.mouseX, this.mouseY, 120);
        g.addColorStop(0, hexToRgba(accent, 0.18));
        g.addColorStop(1, hexToRgba(accent, 0));
        ctx.fillStyle = g;
        ctx.fillRect(this.mouseX - 120, this.mouseY - 120, 240, 240);
      }
    };

    const update = () => {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      this.twinklePhase += this.TWINKLE_SPEED;
      
      // Pre-calculate scroll effects
      const scrollEnergy = Math.min(Math.abs(this.scrollVelocity), 300);
      const normalized = scrollEnergy / 300;
      const energyFactor = 1 + (normalized / (1 + 1.5 * normalized)) * 2;
      const scrollDelta = this.scrollVelocity * this.SCROLL_DAMPING;
      
      stars.forEach(star => {
        // Basic movement
        star.x += star.vx;
        star.y += star.vy;
        
        // Apply scroll parallax
        if (scrollDelta !== 0) {
          star.y -= scrollDelta;
        }
        
        // Mouse interaction - optimized
        if (this.mouseActive) {
          const dx = this.mouseX - star.x;
          const dy = this.mouseY - star.y;
          const distSq = dx * dx + dy * dy;
          
          if (distSq < this.MOUSE_RANGE_SQ && distSq > 0.01) {
            const invDist = 1 / Math.sqrt(distSq);
            const strength = (1 - Math.sqrt(distSq) / 220) * this.MOUSE_ATTRACTION_STRENGTH;
            star.vx += dx * invDist * strength;
            star.vy += dy * invDist * strength;
          }
        }
        
        // Orbital noise
        const noiseInput = (star.x + star.y + this.twinklePhase) * 0.002;
        star.vx += (Math.cos(noiseInput) - 0.5) * this.NOISE_STRENGTH;
        star.vy += (Math.sin(noiseInput) - 0.5) * this.NOISE_STRENGTH;
        
        // Boundary bouncing with energy
        if (star.x - star.radius < 0) {
          star.x = star.radius;
          star.vx = Math.min(Math.max(-star.vx * energyFactor, -this.MAX_SPEED), this.MAX_SPEED);
        } else if (star.x + star.radius > w) {
          star.x = w - star.radius;
          star.vx = Math.min(Math.max(-star.vx * energyFactor, -this.MAX_SPEED), this.MAX_SPEED);
        }
        
        if (star.y - star.radius < 0) {
          star.y = star.radius;
          star.vy = Math.min(Math.max(-star.vy * energyFactor, -this.MAX_SPEED), this.MAX_SPEED);
        } else if (star.y + star.radius > h) {
          star.y = h - star.radius;
          star.vy = Math.min(Math.max(-star.vy * energyFactor, -this.MAX_SPEED), this.MAX_SPEED);
        }

        // Velocity relaxation
        star.vx += (star.baseVx - star.vx) * this.RELAX_FACTOR;
        star.vy += (star.baseVy - star.vy) * this.RELAX_FACTOR;
        
        // Radius twinkling
        star.radius = star.baseRadius * (0.85 + 0.3 * Math.abs(Math.sin(this.twinklePhase + star.twinkleOffset)));
      });
      
      this.scrollVelocity = 0;

      // Update particles - remove in reverse order
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.life--;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
    };

    const animate = () => {
      update();
      draw();
      this.animationFrameId = requestAnimationFrame(animate);
    };

    this.resizeCanvasFn = () => {
      const newDpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
      dpr = newDpr;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      createStars();
      this.accentRgbaCache.clear(); // Only clear what we need
    };
    
    window.addEventListener('resize', this.resizeCanvasFn);
    this.resizeCanvasFn();
    
    // Scroll listener
    this.lastScrollY = window.scrollY;
    this.scrollListener = () => {
      const current = window.scrollY;
      const delta = current - this.lastScrollY;
      this.lastScrollY = current;
      this.scrollVelocity += delta;
      this.scrollVelocity = Math.max(-300, Math.min(300, this.scrollVelocity));
    };
    window.addEventListener('scroll', this.scrollListener, { passive: true });

    // Mouse listeners
    this.mouseMoveListener = (e: Event) => {
      const ev = e as MouseEvent;
      this.mouseX = ev.clientX;
      this.mouseY = ev.clientY;
      this.mouseActive = true;
    };
    this.pointerOutListener = () => { this.mouseActive = false; };
    window.addEventListener('mousemove', this.mouseMoveListener, { passive: true });
    window.addEventListener('pointerleave', this.pointerOutListener);

    // Click listener
    this.clickListener = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const count = Math.min(18, 6 + Math.floor(Math.random() * 12));
      
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 3;
        const color = Math.random() > 0.5 ? accent : 
          (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? '#222' : '#fff');
        
        this.particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 30 + Math.floor(Math.random() * 40),
          r: 1 + Math.random() * 3,
          color
        });
        
        if (this.particles.length > this.MAX_PARTICLES) {
          this.particles.splice(0, this.particles.length - this.MAX_PARTICLES);
        }
      }
    };
    window.addEventListener('click', this.clickListener);
    animate();
  }
}
