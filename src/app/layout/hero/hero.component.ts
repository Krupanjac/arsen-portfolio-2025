import { Component, OnInit, OnDestroy, AfterViewInit, Inject, PLATFORM_ID, ViewEncapsulation, Input, Output, EventEmitter } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TerminalTypingDirective } from '../../shared/terminal-typing.directive';
import { BackgroundComponent } from '../background/background.component';

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [CommonModule, TranslateModule, TerminalTypingDirective, BackgroundComponent],
  templateUrl: './hero.component.html',
  styleUrls: ['./hero.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class HeroComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() showOnlyBackground: boolean = false;
  @Output() openResumeModal = new EventEmitter<void>();
  private originalName = 'Đurđev';
  private charTimeouts: Map<number, any[]> = new Map();
  private randomSymbolsIntervalId: any = null;
  showIndicator = true;
  private scrollHandler = () => {};

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    // Name Randomization Effect
    this.randomSymbolsIntervalId = setInterval(() => this.randomSymbols(), 1000);
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
    if (this.randomSymbolsIntervalId !== null) {
      clearInterval(this.randomSymbolsIntervalId);
    }
    this.charTimeouts.forEach((timeouts) => {
      timeouts.forEach(t => clearTimeout(t));
    });
    this.charTimeouts.clear();
  // remove scroll listener
  try { window.removeEventListener('scroll', this.scrollHandler, { passive: true } as any); } catch {}
  }

  private async randomSymbols(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const symbols = "!@#$%^&*()-_=+[]{}|;:,.<>?";
    const nameChars = Array.from(this.originalName);
    if (nameChars.length === 0) return;
    
    const indices = new Set<number>();
    const count = Math.min(2, nameChars.length);
    while (indices.size < count) {
      indices.add(Math.floor(Math.random() * nameChars.length));
    }
    
    const container = document.getElementById('su_name');
    if (!container) return;
    const firstSpan = container.querySelector('span[data-index="0"]') as HTMLElement | null;
    if (!firstSpan) {
      this.setupNameSpans();
    }

    let anyAnimated = false;
    const selected = Array.from(indices.values()).sort((a, b) => a - b);

    // Restore non-selected spans immediately
    const spans = container.querySelectorAll('span[data-index]');
    spans.forEach(s => {
      const idx = Number(s.getAttribute('data-index'));
      if (!selected.includes(idx)) {
        const orig = nameChars[idx];
        if ((s.textContent || '') !== orig) {
          const prev = this.charTimeouts.get(idx);
          if (prev && Array.isArray(prev)) {
            prev.forEach(t => clearTimeout(t));
            this.charTimeouts.delete(idx);
          }
          (s as HTMLElement).textContent = orig;
        }
      }
    });

    // Animate selected indices
    const holdDuration = 1600;
    const staggerMs = 180;
    for (const i of selected) {
      const sym = symbols[Math.floor(Math.random() * symbols.length)];
      const span = container.querySelector(`span[data-index="${i}"]`) as HTMLElement | null;
      if (span) {
        anyAnimated = true;
        await this.animateCharChange(i, sym);
        await new Promise(r => setTimeout(r, staggerMs));
      }
    }

    // Restore animated characters
    if (anyAnimated) {
      await new Promise(resolve => setTimeout(resolve, holdDuration));
      for (const i of selected) {
        const span = container.querySelector(`span[data-index="${i}"]`) as HTMLElement | null;
        if (span) {
          await this.animateCharChange(i, nameChars[i]);
          await new Promise(r => setTimeout(r, staggerMs));
        }
      }
    } else {
      const arr = nameChars.slice();
      indices.forEach(i => arr[i] = symbols[Math.floor(Math.random() * symbols.length)]);
      container.textContent = arr.join('');
    }
  }

  private setupNameSpans(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const container = document.getElementById('su_name');
    if (!container) return;
    const chars = Array.from(this.originalName);
    container.innerHTML = '';
    chars.forEach((ch, idx) => {
      const span = document.createElement('span');
      span.className = 'su-char inline-block';
      span.setAttribute('data-index', String(idx));
      span.textContent = ch;
      container.appendChild(span);
    });
  }

  private animateCharChange(index: number, targetChar: string, speedMs = 140): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return Promise.resolve();
    const container = document.getElementById('su_name');
    if (!container) return Promise.resolve();
    const span = container.querySelector(`span[data-index="${index}"]`) as HTMLElement | null;
    if (!span) return Promise.resolve();

    const prevArr = this.charTimeouts.get(index);
    if (prevArr && Array.isArray(prevArr)) {
      prevArr.forEach(t => clearTimeout(t));
      this.charTimeouts.delete(index);
    }

    const removeTimer = (idx: number, id: number | any) => {
      const arr = this.charTimeouts.get(idx) || [];
      const pos = arr.indexOf(id);
      if (pos >= 0) arr.splice(pos, 1);
      if (arr.length) this.charTimeouts.set(idx, arr);
      else this.charTimeouts.delete(idx);
    };

    const eraseSpeed = Math.max(120, Math.floor(speedMs));
    const typePause = Math.max(500, Math.floor(speedMs * 4));

    const cssVar = (typeof window !== 'undefined') ? 
      getComputedStyle(document.documentElement).getPropertyValue('--color-terminal-directive').trim() : '';
    const cursorBg = cssVar || '#ffffff';
    const cursorHtml = `<span class="tt-cursor" style="background:${cursorBg}">&nbsp;</span>`;

    span.innerHTML = cursorHtml;

    return new Promise<void>((resolve) => {
      const t1 = window.setTimeout(() => {
        span.innerHTML = `${this.escapeHtml(targetChar)}${cursorHtml}`;
        const t2 = window.setTimeout(() => {
          span.textContent = targetChar;
          removeTimer(index, t2);
          removeTimer(index, t1);
          resolve();
        }, typePause);
        const arr2 = this.charTimeouts.get(index) || [];
        arr2.push(t2);
        this.charTimeouts.set(index, arr2);
      }, eraseSpeed);
      const arr1 = this.charTimeouts.get(index) || [];
      arr1.push(t1);
      this.charTimeouts.set(index, arr1);
    });
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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