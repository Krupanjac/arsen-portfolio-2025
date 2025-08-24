import { Component, AfterViewInit, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TerminalTypingDirective } from '../../shared/terminal-typing.directive';
import { LoginComponent } from '../../login/login.component';

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [RouterModule, CommonModule, TranslateModule, FormsModule, TerminalTypingDirective, LoginComponent],
  // No custom providers
  templateUrl: './nav.component.html',
  styleUrls: ['./nav.component.scss']
})
export class NavComponent implements AfterViewInit, OnInit, OnDestroy {
  // Dashboard / auth state
  isDashboardOpen = false;
  isAuthenticated = false;
  username: string | null = null;
  loginUsername = '';
  loginPassword = '';
  isNavOpen = false;
  isLangLoading = false;
  activeId: string | null = null;
  private observer: IntersectionObserver | null = null;
  private scrollAnimationId: number | null = null;
  private isUserInteracting = false;
  theme: 'light' | 'dark' = 'dark';
  private authListener: ((ev: Event) => void) | null = null;

  toggleNav(): void {
    this.isNavOpen = !this.isNavOpen;
  }

  constructor(private translate: TranslateService, private router: Router) {
    // Ensure a language is set at startup
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('lang') : null;
    const lang = stored || 'en';
    this.translate.use(lang);
    // Theme init
    if (typeof document !== 'undefined') {
      try {
        const storedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.theme = (storedTheme === 'light' || storedTheme === 'dark') ? storedTheme as any : (prefersDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', this.theme);
      } catch {
        document.documentElement.setAttribute('data-theme', this.theme);
      }
    }
  }

  ngOnInit(): void {
    // check current session on init
    try { this.checkSession(); } catch {}
  // listen for login events from embedded login component
  this.authListener = () => { try { this.checkSession(); } catch {} };
  try { window.addEventListener('auth:login', this.authListener); } catch {}
  }

  async onAuthClick() {
    this.isDashboardOpen = !this.isDashboardOpen;
    if (this.isDashboardOpen) {
      await this.checkSession();
    }
  }

  closeDashboard() {
    this.isDashboardOpen = false;
  }

  async checkSession() {
    try {
      const res = await fetch('/api/session', { credentials: 'include' });
      if (!res.ok) {
        this.isAuthenticated = false;
        this.username = null;
        return;
      }
      const data = await res.json();
      this.isAuthenticated = !!data?.authenticated;
      this.username = data?.username || null;
    } catch (e) {
      this.isAuthenticated = false;
      this.username = null;
    }
  }

  async onLogin(event: Event) {
    if (event) { event.preventDefault(); }
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.loginUsername, password: this.loginPassword })
      });
      if (!res.ok) {
        // simple error feedback
        alert('Invalid credentials');
        return;
      }
      // cookie is set by server (HttpOnly). Refresh session state.
      await this.checkSession();
    } catch (e) {
      alert('Login failed');
    }
  }

  async onLogout() {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    this.isAuthenticated = false;
    this.username = null;
    this.closeDashboard();
  }

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', this.theme);
    }
    try { localStorage.setItem('theme', this.theme); } catch {}
  }

  /**
   * When the logo is clicked: if we're already on the site root, force a full reload
   * to refresh the page. If not on root, navigate to root.
   */
  onLogoClick(event: Event) {
    if (event) {
      event.preventDefault();
      try { (event as any).stopImmediatePropagation(); } catch {}
    }
    if (typeof window === 'undefined' || typeof location === 'undefined') return;

    const currentPath = window.location.pathname || '/';
    // Normalize trailing slash
    const normalized = currentPath.endsWith('/') ? currentPath : currentPath;

    if (normalized === '/' || normalized === '') {
      // force a full reload
      window.location.reload();
    } else {
      // navigate to root via the router for single-page transition
      try {
        this.router.navigateByUrl('/');
      } catch {
        // fallback: assign href
        window.location.href = '/';
      }
    }
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
  if (this.authListener) { try { window.removeEventListener('auth:login', this.authListener); } catch {} }
  }
}