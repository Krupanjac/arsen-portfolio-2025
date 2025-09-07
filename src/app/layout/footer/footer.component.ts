import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss']
})
export class FooterComponent {
  year = new Date().getFullYear();

  onBackToTop(event: Event) {
    if (event) {
      event.preventDefault();
      try { (event as any).stopImmediatePropagation(); } catch {}
    }
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const el = document.getElementById('start');
    if (!el) return;

    const header = document.querySelector('header');
    const headerHeight = header instanceof HTMLElement ? header.offsetHeight : 0;
    const gap = 8;
    const rectTop = el.getBoundingClientRect().top + window.scrollY;
    const targetY = Math.max(rectTop - headerHeight - gap, 0);

    this.animateScrollTo(targetY);
    try { history.replaceState(null, '', '#start'); } catch {}
  }

  private scrollAnimationId: number | null = null;
  private isUserInteracting = false;

  private animateScrollTo(targetY: number) {
    if (typeof window === 'undefined') return;

    if (this.scrollAnimationId !== null) {
      cancelAnimationFrame(this.scrollAnimationId);
      this.scrollAnimationId = null;
    }

    const startY = window.scrollY;
    const distance = targetY - startY;
    if (Math.abs(distance) < 2) {
      window.scrollTo(0, targetY);
      return;
    }

    const absDist = Math.abs(distance);
    const minDuration = 400;
    const maxDuration = 1200;
    const duration = Math.min(maxDuration, Math.max(minDuration, absDist * 0.5));
    const startTime = performance.now();

    const easeInOutCubic = (t: number) => t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const step = (now: number) => {
      if (this.isUserInteracting) {
        this.scrollAnimationId = null;
        return;
      }
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeInOutCubic(progress);
      window.scrollTo(0, startY + distance * eased);
      if (progress < 1) {
        this.scrollAnimationId = requestAnimationFrame(step);
      } else {
        this.scrollAnimationId = null;
      }
    };

    const interruptEvents = ['wheel', 'touchstart', 'keydown'];
    const markInteracting = () => { this.isUserInteracting = true; cleanup(); };
    const cleanup = () => {
      interruptEvents.forEach(ev => window.removeEventListener(ev, markInteracting, { passive: true } as any));
    };
    interruptEvents.forEach(ev => window.addEventListener(ev, markInteracting, { passive: true }));

    this.isUserInteracting = false;
    this.scrollAnimationId = requestAnimationFrame(step);
  }
}
