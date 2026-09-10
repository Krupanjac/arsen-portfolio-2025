import { Component, OnInit, OnDestroy, AfterViewInit, Inject, PLATFORM_ID, ViewEncapsulation, Input, Output, EventEmitter } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TerminalTypingDirective } from '../../shared/terminal-typing.directive';
import { HeroRenderComponent } from '../hero-render/hero-render.component';
import { TooltipDirective } from '../../shared/tooltip.directive';

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [CommonModule, TranslateModule, TerminalTypingDirective, HeroRenderComponent, TooltipDirective],
  templateUrl: './hero.component.html',
  styleUrls: ['./hero.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class HeroComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() showOnlyBackground: boolean = false;
  @Output() openResumeModal = new EventEmitter<void>();
  private originalName = 'Đurđev';
  private readonly pendingRestores = new Set<number>();
  private lastScrambleIndex = -1;
  private scrambleIntervalId: any = null;
  showIndicator = true;
  private scrollHandler = () => {};

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    // Name scramble. 2.6s apart: often enough to notice, rare enough that it
    // never competes with reading the name.
    this.scrambleIntervalId = setInterval(() => this.scramble(), 2600);
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.setupNameSpans();
  this.initIndicatorVisibility();
  }

  ngOnDestroy(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    if (this.scrambleIntervalId !== null) {
      clearInterval(this.scrambleIntervalId);
    }
    this.pendingRestores.forEach((t) => clearTimeout(t));
    this.pendingRestores.clear();
  // remove scroll listener
  try { window.removeEventListener('scroll', this.scrollHandler, { passive: true } as any); } catch {}
  }

  /**
   * Name scramble.
   *
   * Rewritten from the original two-character version: at the old 2rem size a
   * pair of substituted glyphs plus a text cursor read as a glitch, but the
   * name is now set at up to 7.5rem and the same effect left the single most
   * important string on the page spelling something else, with two 8px-wide
   * white blocks sitting in the middle of it.
   *
   * One character, one substitution, ~110ms, no cursor. The name stays
   * readable through the whole cycle.
   */
  private scramble(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const container = document.getElementById('su_name');
    if (!container) return;
    if (!container.querySelector('span[data-index="0"]')) this.setupNameSpans();

    // Never touch the same glyph twice in a row — repeatedly flickering one
    // letter looks like a rendering fault rather than an intentional effect.
    const chars = Array.from(this.originalName);
    let index = Math.floor(Math.random() * chars.length);
    if (index === this.lastScrambleIndex && chars.length > 1) {
      index = (index + 1 + Math.floor(Math.random() * (chars.length - 1))) % chars.length;
    }
    this.lastScrambleIndex = index;

    const span = container.querySelector(
      `span[data-index="${index}"]`,
    ) as HTMLElement | null;
    if (!span) return;

    const symbols = '#%&@$*+=/\\<>';
    const original = chars[index];
    span.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    span.classList.add('su-char--glitch');

    const restore = window.setTimeout(() => {
      span.textContent = original;
      span.classList.remove('su-char--glitch');
      this.pendingRestores.delete(restore);
    }, 110);
    this.pendingRestores.add(restore);
  }

  /** Splits the surname into per-character spans so one can be swapped alone. */
  private setupNameSpans(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const container = document.getElementById('su_name');
    if (!container) return;
    container.innerHTML = '';
    Array.from(this.originalName).forEach((ch, idx) => {
      const span = document.createElement('span');
      span.className = 'su-char';
      span.setAttribute('data-index', String(idx));
      span.textContent = ch;
      container.appendChild(span);
    });
  }

  private initIndicatorVisibility(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    // threshold: hide once user scrolls more than 60px from top of hero
  const threshold = 150; // px before fade-out
    this.scrollHandler = () => {
      const y = window.scrollY || 0;
      const shouldShow = y < threshold;
      if (shouldShow !== this.showIndicator) {
        this.showIndicator = shouldShow;
      }
    };
    try { window.addEventListener('scroll', this.scrollHandler, { passive: true }); } catch {}
    // initial compute
    this.scrollHandler();
  }

  // Smooth animated scroll (same easing philosophy as nav) with no header offset
  scrollToHome(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const target = document.getElementById('home');
    if (!target) return;
    const targetY = Math.max(target.getBoundingClientRect().top + window.scrollY, 0);
    const startY = window.scrollY;
    const distance = targetY - startY;
    if (Math.abs(distance) < 2) {
      window.scrollTo(0, targetY);
      try { history.replaceState(null, '', '#home'); } catch {}
      return;
    }
    const absDist = Math.abs(distance);
    const minDuration = 400; // ms
    const maxDuration = 1200; // ms
    const duration = Math.min(maxDuration, Math.max(minDuration, absDist * 0.5));
    const startTime = performance.now();
    const easeInOutCubic = (t: number) => t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeInOutCubic(progress);
      window.scrollTo(0, startY + distance * eased);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        try { history.replaceState(null, '', '#home'); } catch {}
      }
    };
    requestAnimationFrame(step);
  }
}