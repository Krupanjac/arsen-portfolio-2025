import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [RouterModule, CommonModule, TranslateModule],
  // No custom providers
  templateUrl: './nav.component.html',
  styleUrls: ['./nav.component.scss']
})
export class NavComponent implements AfterViewInit, OnDestroy {
  isNavOpen = false;
  isLangLoading = false;
  activeId: string | null = null;
  private observer: IntersectionObserver | null = null;
  private scrollAnimationId: number | null = null;
  private isUserInteracting = false;

  toggleNav(): void {
    this.isNavOpen = !this.isNavOpen;
  }

  constructor(private translate: TranslateService) {
    // Ensure a language is set at startup
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('lang') : null;
    const lang = stored || 'en';
    this.translate.use(lang);
  }

  ngAfterViewInit(): void {
    // Initialize intersection observer after view is ready
    this.initSectionObserver();
  }

  // (initial placeholder ngOnDestroy removed; final version at bottom consolidates cleanup)

  setLang(lang: 'en' | 'sr') {
    const current = (this.translate as any).getCurrentLang ? (this.translate as any).getCurrentLang() : null;
    if (current === lang || this.isLangLoading) {
      return;
    }
    this.isLangLoading = true;
    this.translate.use(lang).subscribe({
      next: () => {
        this.isLangLoading = false;
        try { localStorage.setItem('lang', lang); } catch {}
      },
      error: () => {
        this.isLangLoading = false;
      }
    });
  }

  // Public handler for desktop navigation clicks
  onNavigate(event: Event, id: string) {
    if (event) {
      event.preventDefault();
      try { (event as any).stopImmediatePropagation(); } catch {}
    }
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const el = document.getElementById(id);
    if (!el) return;

    const header = document.querySelector('header');
    const headerHeight = header instanceof HTMLElement ? header.offsetHeight : 0;
    const gap = 8;
    const rectTop = el.getBoundingClientRect().top + window.scrollY;
    const targetY = Math.max(rectTop - headerHeight - gap, 0);

    this.animateScrollTo(targetY);
    // Optimistically set active state
    this.activeId = id;
    try { history.replaceState(null, '', `#${id}`); } catch {}
  }

  // Mobile navigation: scroll and close mobile menu with slight delay
  onNavigateMobile(event: Event, id: string) {
    if (event) { event.preventDefault(); }
    this.toggleNav();
    const closeDelay = 250; // allow dropdown close animation (ms)
    setTimeout(() => this.onNavigate(event, id), closeDelay);
  }

  /**
   * Custom smooth scrolling using requestAnimationFrame for consistent speed
   * across browsers and fine-tuned easing.
   */
  private animateScrollTo(targetY: number) {
    if (typeof window === 'undefined') return;

    // Cancel any existing animation
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

    // Duration scales gently with distance
    const absDist = Math.abs(distance);
    const minDuration = 400; // ms
    const maxDuration = 1200; // ms
    const duration = Math.min(maxDuration, Math.max(minDuration, absDist * 0.5));
    const startTime = performance.now();

    const easeInOutCubic = (t: number) => t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const step = (now: number) => {
      if (this.isUserInteracting) { // abort if user starts scrolling manually
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

    // Listen for user interrupt events to cancel animation
    const interruptEvents = ['wheel', 'touchstart', 'keydown'];
    const markInteracting = () => { this.isUserInteracting = true; cleanup(); };
    const cleanup = () => {
      interruptEvents.forEach(ev => window.removeEventListener(ev, markInteracting, { passive: true } as any));
    };
    interruptEvents.forEach(ev => window.addEventListener(ev, markInteracting, { passive: true }));

    this.isUserInteracting = false;
    this.scrollAnimationId = requestAnimationFrame(step);
  }

  private initSectionObserver() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    // Determine header height for rootMargin so sections account for fixed header
    const header = document.querySelector('header');
    const headerHeight = header instanceof HTMLElement ? header.offsetHeight : 0;

    const options: IntersectionObserverInit = {
      root: null,
      rootMargin: `-${headerHeight + 8}px 0px -40% 0px`,
      threshold: [0.1, 0.25, 0.5, 0.75]
    };

    this.observer = new IntersectionObserver((entries) => {
      // Choose the most visible entry that's intersecting
      const visible = entries.filter(e => e.isIntersecting);
      if (visible.length === 0) return;
      visible.sort((a, b) => (b.intersectionRatio - a.intersectionRatio));
      const topEntry = visible[0];
      const id = topEntry.target.getAttribute('id');
      if (id) {
        this.activeId = id;
      }
    }, options);

    const sections = document.querySelectorAll('section[id]');
    sections.forEach(s => this.observer?.observe(s));
  }

  ngOnDestroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.scrollAnimationId !== null) {
      cancelAnimationFrame(this.scrollAnimationId);
      this.scrollAnimationId = null;
    }
  }
}