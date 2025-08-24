import { Directive, ElementRef, Input, OnDestroy, OnInit, Renderer2 } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

/**
 * Lightweight directive that, on language change, quickly erases and retypes
 * the element's translated text with a terminal/cursor feel.
 * Usage: add attribute `appTerminalTyping` to any element that uses the translate pipe.
 */
@Directive({
  selector: '[appTerminalTyping]',
  standalone: true,
  host: { }
})
export class TerminalTypingDirective implements OnInit, OnDestroy {
  // accept either a number or string so the directive can be used as a bare attribute
  @Input('appTerminalTyping') speed: number | string | undefined;

  private actualSpeed = 20; // coerced numeric speed (ms per character)
  private originalText = '';
  private sub: Subscription | null = null;
  private typingTimeout: any = null;
  private transSub: Subscription | null = null;

  constructor(private el: ElementRef<HTMLElement>, private renderer: Renderer2, private translate: TranslateService) {}

  ngOnInit(): void {
  // Coerce input speed to numeric; allow bare attribute usage ('' -> default)
  this.actualSpeed = this.coerceSpeed(this.speed);

  // Capture initial text (already translated by pipe)
  this.originalText = this.getTextContent();

    // Subscribe to language changes
    if ((this.translate as any).onLangChange) {
      this.sub = (this.translate as any).onLangChange.subscribe(() => {
        // If developer provided a data-i18n-key attribute, prefer reading the
        // translation directly from the TranslateService. This is reliable even
        // if the pipe hasn't updated the DOM yet or translations are loaded async.
        const el = this.el.nativeElement as HTMLElement;
        const key = el.getAttribute('data-i18n-key');
        if (key) {
          if (this.transSub) { this.transSub.unsubscribe(); this.transSub = null; }
          // get() will return the translated value and handle async loading
          this.transSub = this.translate.get(key).subscribe((translated: string) => {
            this.playFastRewrite(translated);
          });
        } else {
          // short delay to allow pipe DOM updates where no key is provided
          setTimeout(() => this.playFastRewrite(), 40);
        }
      });
    }
  }

  private coerceSpeed(v: number | string | undefined): number {
    const fallback = 20;
    if (typeof v === 'number') return isFinite(v) && v > 0 ? v : fallback;
    if (typeof v === 'string') {
      // empty string (bare attribute) should use default
      if (v.trim() === '') return fallback;
      const parsed = Number(v);
      return isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }
    return fallback;
  }

  private getTextContent(): string {
    // prefer textContent but preserve innerHTML for links/spans where needed
    return this.el.nativeElement.innerHTML || '';
  }

  /**
   * If `targetOverride` is provided, use that string as the final text to type.
   * Otherwise, read the element's innerHTML as the target.
   */
  private playFastRewrite(targetOverride?: string): void {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }

    // Read the updated translated content (Translate pipe updates DOM before subscriber runs in many cases,
    // but to be safe, we query TranslateService for the key if element has a data-i18n-key attr; otherwise read innerHTML)
  const target = typeof targetOverride === 'string' ? targetOverride : this.getTextContent();

    // Quick erase animation: remove characters quickly
    const el = this.el.nativeElement;
    let cur = el.innerHTML;
  const eraseSpeed = Math.max(6, Math.floor(this.actualSpeed / 3));

    const eraseStep = () => {
      // remove last char/html char until empty (fast)
      if (cur.length > 0) {
        cur = cur.slice(0, -1);
  this.renderer.setProperty(el, 'innerHTML', cur + '<span class="tt-cursor">&nbsp;</span>');
  this.typingTimeout = setTimeout(eraseStep, eraseSpeed);
      } else {
        // start typing target
        this.typeInTarget(target);
      }
    };

    eraseStep();
  }

  private typeInTarget(target: string) {
    const el = this.el.nativeElement;
    let i = 0;
    const typeStep = () => {
      if (i <= target.length) {
  const out = target.slice(0, i) + '<span class="tt-cursor">&nbsp;</span>';
        this.renderer.setProperty(el, 'innerHTML', out);
        i++;
  this.typingTimeout = setTimeout(typeStep, this.actualSpeed);
      } else {
        // final: set full content without cursor element
        this.renderer.setProperty(el, 'innerHTML', target);
        this.typingTimeout = null;
      }
    };
    typeStep();
  }

  ngOnDestroy(): void {
    if (this.sub) this.sub.unsubscribe();
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
  }
}
