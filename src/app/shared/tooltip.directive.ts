import { Directive, ElementRef, HostListener, Input, Renderer2, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';

let tooltipStyleInjected = false;

@Directive({
  selector: '[appTooltip]',
  standalone: true
})
export class TooltipDirective {
  @Input('appTooltip') text: string = '';
  @Input() tooltipPlacement: 'top' | 'bottom' = 'top';
  private bubble: HTMLElement | null = null;
  private hideTimeout: any = null;

  constructor(
    private host: ElementRef<HTMLElement>,
    private renderer: Renderer2,
    @Inject(PLATFORM_ID) private platformId: Object,
    private translate: TranslateService
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.ensureGlobalStyles();
      this.renderer.setAttribute(this.host.nativeElement, 'tabindex', this.host.nativeElement.getAttribute('tabindex') || '0');
      this.renderer.setAttribute(this.host.nativeElement, 'aria-describedby', '');
    }
  }

  private ensureGlobalStyles() {
    if (tooltipStyleInjected) return;
    const style = this.renderer.createElement('style');
    style.textContent = `
      .tooltip-bubble{position:fixed;z-index:9999;pointer-events:none;background:rgba(15,23,42,.9);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);border:1px solid rgba(var(--color-accent-rgb),0.35);padding:4px 10px;font-size:12px;line-height:1.2;font-weight:500;border-radius:6px;color:var(--color-primary,#fff);box-shadow:0 4px 12px -4px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,0.04);opacity:0;transform:translate(-50%,-4px) scale(.92);transition:opacity .18s ease,transform .18s cubic-bezier(.4,.18,.2,1);will-change:transform,opacity;}
      .tooltip-bubble[data-placement="bottom"]{transform:translate(-50%,4px) scale(.92);}
      .tooltip-bubble.visible{opacity:1;transform:translate(-50%,-8px) scale(1);}
      .tooltip-bubble[data-placement="bottom"].visible{transform:translate(-50%,8px) scale(1);}
    `;
    document.head.appendChild(style);
    tooltipStyleInjected = true;
  }

  private createBubble() {
    if (!isPlatformBrowser(this.platformId) || this.bubble) return;
    if (!this.text) return;
    const b = this.renderer.createElement('div');
    b.className = 'tooltip-bubble';
    b.setAttribute('role', 'tooltip');
    b.setAttribute('data-placement', this.tooltipPlacement);
  b.textContent = this.resolveText();
    this.bubble = b;
    document.body.appendChild(b);
    this.positionBubble();
    requestAnimationFrame(() => b.classList.add('visible'));
  }

  private positionBubble() {
    if (!this.bubble || !isPlatformBrowser(this.platformId)) return;
    const rect = this.host.nativeElement.getBoundingClientRect();
    const b = this.bubble;
    const gap = 10;
    const top = this.tooltipPlacement === 'top' ? rect.top - gap : rect.bottom + gap;
    const left = rect.left + rect.width / 2;
    b.style.top = `${top}px`;
    b.style.left = `${left}px`;
  }

  private destroyBubble(immediate = false) {
    if (!this.bubble) return;
    const b = this.bubble;
    if (immediate) {
      b.remove();
      this.bubble = null;
      return;
    }
    b.classList.remove('visible');
    this.hideTimeout = setTimeout(() => {
      try { b.remove(); } catch {}
      this.bubble = null;
    }, 180);
  }

  @HostListener('mouseenter') onEnter() { this.show(); }
  @HostListener('focus') onFocus() { this.show(); }
  @HostListener('mouseleave') onLeave() { this.hide(); }
  @HostListener('blur') onBlur() { this.hide(); }
  @HostListener('touchstart') onTouch() { this.toggleTouch(); }
  @HostListener('click') onClick() { this.hide(); }
  @HostListener('window:scroll') onScroll() { this.positionBubble(); }
  @HostListener('window:resize') onResize() { this.positionBubble(); }

  private show() {
    if (!isPlatformBrowser(this.platformId)) return;
    clearTimeout(this.hideTimeout);
  if (!this.text) return;
    if (!this.bubble) this.createBubble();
    else this.positionBubble();
  }

  private hide() { this.destroyBubble(); }

  private toggleTouch() {
    if (this.bubble) this.hide();
    else this.show();
  }

  private resolveText(): string {
    if (!this.text) return '';
    // If text looks like a translation key (contains a dot or uppercase with underscore), attempt translate
    const looksLikeKey = /[A-Z]/.test(this.text) || this.text.includes('.') || this.text.startsWith('TOOLTIP');
    if (looksLikeKey) {
      try {
        const translated = this.translate.instant(this.text);
        if (translated && translated !== this.text) return translated;
      } catch {}
    }
    return this.text;
  }
}
