import { Component, ChangeDetectorRef, ElementRef, Renderer2, ViewEncapsulation, OnInit, OnDestroy, AfterViewInit, ViewChildren, QueryList, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TerminalTypingDirective } from '../shared/terminal-typing.directive';
import { DomSanitizer } from '@angular/platform-browser';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, TranslateModule, TerminalTypingDirective],
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss'],
  encapsulation: ViewEncapsulation.None,
  animations: [
    trigger('modalAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-20px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('300ms ease-in', style({ opacity: 0, transform: 'translateY(-20px)' }))
      ])
    ]),
    // Subtle fade/slide-in for non-typed output lines
    trigger('lineFade', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(6px)' }),
        animate('350ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class AboutComponent implements OnInit, AfterViewInit, OnDestroy {
  // IntersectionObserver to start typing when visible
  private ioObserver: IntersectionObserver | null = null;
  private hasTriggered = false;
  private langChangeSub: Subscription | null = null;
  private triggerTimeouts: any[] = [];
  public started = false; // controls opacity until typing begins
  @ViewChild('aboutTerminal') private aboutTerminal?: ElementRef<HTMLElement>;

  modalVisible: boolean = false;
  modalMessage: string = '';
  private modalTimeout: any;

  // Collect all terminal-typing instances in the template to trigger sequentially
  @ViewChildren(TerminalTypingDirective) private tts!: QueryList<TerminalTypingDirective>;

  constructor(
    private cdr: ChangeDetectorRef,
    private elRef: ElementRef,
    private renderer: Renderer2,
    private sanitizer: DomSanitizer,
    private translate: TranslateService
  ) {
    // no-op
  }

  ngOnInit(): void {
    // Subscribe to runtime language changes to re-animate content via directive
    if (typeof window !== 'undefined') {
      this.langChangeSub = this.translate.onLangChange.subscribe(() => {
        // The directive will do a quick rewrite on language change by itself.
        // We can also add a soft visual refresh by fading outputs (handled by *ngIf cycles if needed).
      });
    }
  }

  ngAfterViewInit(): void {
    if (typeof window === 'undefined') return;
  // If the list of typing directives changes, try triggering again
    this.tts.changes.subscribe(() => {
    if (!this.hasTriggered) {
        // small delay to ensure DOM is painted before triggering sequence
        setTimeout(() => this.triggerTypingSequence(), 0);
      }
    });
    // Defer the typing until the component is visible in the viewport
    try {
      this.ioObserver = new IntersectionObserver((entries) => {
        const e = entries[0];
        if (e && e.isIntersecting) {
          if (this.ioObserver) {
            this.ioObserver.disconnect();
            this.ioObserver = null;
          }
      // Trigger typing now that terminal is visible
      this.triggerTypingSequence();
        }
    }, { threshold: 0.15 });
    // Observe the terminal container directly if available, otherwise fallback to host
    const target = this.aboutTerminal?.nativeElement || this.elRef.nativeElement;
    this.ioObserver.observe(target);
    } catch (err) {
      // Fallback: if IntersectionObserver isn't available, start immediately
    this.triggerTypingSequence();
    }
  }
  private triggerTypingSequence(): void {
    if (this.hasTriggered) return;
    // Wait until typing directives exist in the view
    if (!this.tts || this.tts.length === 0) {
      return; // will be called again via tts.changes subscription
    }
    this.started = true; // reveal container
    // Stagger manual triggers across all terminal typing directives
    const speed = 120; // ms between line starts
    let i = 0;
    this.tts.forEach((d: TerminalTypingDirective) => {
      const t = setTimeout(() => {
        try {
          const hostEl: HTMLElement | null = (d as any)?.el?.nativeElement || null;
          const key = hostEl?.getAttribute('data-i18n-key');
          if (key) {
            this.translate.get(key).pipe(take(1)).subscribe((txt: string) => {
              d.triggerTyping(txt);
            });
          } else {
            d.triggerTyping();
          }
        } catch {
          d.triggerTyping();
        }
      }, i * speed);
      this.triggerTimeouts.push(t);
      i++;
    });
    this.hasTriggered = true;
  }

  copyToClipboard(text: string): void {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      const msg = this.translate.instant('CONTACT.COPIED', { email: text });
      this.showModal(`${msg}`);
    }).catch(() => {
      const msg = this.translate.instant('CONTACT.COPY_FAILED');
      this.showModal(msg);
    });
  }

  showModal(message: string): void {
    this.modalMessage = message;
    this.modalVisible = true;
    if (this.modalTimeout) clearTimeout(this.modalTimeout);
    this.modalTimeout = setTimeout(() => {
      this.hideModal();
      this.cdr.detectChanges();
    }, 2000);
  }

  hideModal(): void {
    this.modalVisible = false;
  }

  ngOnDestroy(): void {
    if (this.modalTimeout) clearTimeout(this.modalTimeout);
  if (this.langChangeSub) this.langChangeSub.unsubscribe();
  this.triggerTimeouts.forEach(t => clearTimeout(t));
    if (this.ioObserver) {
      try { this.ioObserver.disconnect(); } catch (e) { /* ignore */ }
      this.ioObserver = null;
    }
  }
}
