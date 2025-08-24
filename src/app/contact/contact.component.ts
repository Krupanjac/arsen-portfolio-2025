// Language: TypeScript
import { Component, ChangeDetectorRef, ElementRef, Renderer2, AfterViewChecked, AfterViewInit, ViewEncapsulation, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslateService } from '@ngx-translate/core';
import { TranslateModule } from '@ngx-translate/core';
import { TerminalTypingDirective } from '../shared/terminal-typing.directive';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, TranslateModule, TerminalTypingDirective],
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss'],
  encapsulation: ViewEncapsulation.None, // Ensures CSS works on dynamically added elements
  animations: [
    trigger('modalAnimation', [
      // When modal enters, fade in and slide down
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-20px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      // When modal leaves, fade out and slide up
      transition(':leave', [
        animate('300ms ease-in', style({ opacity: 0, transform: 'translateY(-20px)' }))
      ])
    ])
  ]
})
export class ContactComponent implements OnInit, AfterViewChecked, AfterViewInit, OnDestroy {
  // IntersectionObserver to delay typing until visible
  private ioObserver: IntersectionObserver | null = null;
  private hasStartedTyping = false;
  contactLines: string[] = [];
  displayText: any = ""; // will hold SafeHtml from DomSanitizer during typing
  // Raw HTML string we build as the typewriter runs. We'll sanitize before binding.
  displayTextRaw: string = "";
  cursorVisible: boolean = false;
  private lineIndex = 0;
  private charIndex = 0;
  private isTypingFinished = false;

  // New properties for the custom modal
  modalVisible: boolean = false;
  modalMessage: string = "";
  private modalTimeout: any;

  private blinkIntervalId: any;

  constructor(
    private cdr: ChangeDetectorRef,
    private elRef: ElementRef,
    private renderer: Renderer2,
  private sanitizer: DomSanitizer,
  private translate: TranslateService
  ) {
    // Start the typewriter effect immediately (browser only)
    if (typeof window !== 'undefined') {
      this.blinkIntervalId = setInterval(() => {
        this.cdr.detectChanges();
        this.toggleCursorVisibility();
      }, 500);
    }
  }

  ngOnInit(): void {
    // Hardcoded contact lines (with embedded emails in span.copyable)
    this.contactLines = [
      `root@terminal:~$ E-MAIL - <span class="copyable" data-email="arsen.djurdjev@live.com">arsen.djurdjev@live.com</span>`,
      'root@terminal:~$ '
    ];
    // On the server, avoid timers to prevent SSR timeouts; render instantly
    if (typeof window === 'undefined') {
      this.displayTextRaw = this.contactLines.join('\n');
      // Sanitize server-side string for template binding
      this.displayText = this.sanitizer.bypassSecurityTrustHtml(this.displayTextRaw);
      this.isTypingFinished = true;
      return;
    }
    // Defer typing until the element is in viewport
    try {
      this.ioObserver = new IntersectionObserver((entries) => {
        const e = entries[0];
        if (e && e.isIntersecting) {
          if (this.ioObserver) { this.ioObserver.disconnect(); this.ioObserver = null; }
          this.startTyping();
        }
      }, { threshold: 0.1 });
      this.ioObserver.observe(this.elRef.nativeElement);
    } catch (err) {
      this.startTyping();
    }
  }

  ngAfterViewInit(): void {
    // ensure IntersectionObserver attached if needed (no-op if already observed)
    // kept for lifecycle completeness
  }

  private startTyping(): void {
    if (this.hasStartedTyping) return;
    this.hasStartedTyping = true;
    this.typeText();
  }

  ngAfterViewChecked(): void {
  if (this.isTypingFinished && typeof document !== 'undefined') {
      this.attachClickHandlers();
    }
  }

  typeText(): void {
    if (this.lineIndex < this.contactLines.length) {
      if (this.charIndex < this.contactLines[this.lineIndex].length) {
  // Append to raw HTML string (includes span tags)
  this.displayTextRaw += this.contactLines[this.lineIndex][this.charIndex];
  // Sanitize for binding to innerHTML so Angular doesn't strip tags
  this.displayText = this.sanitizer.bypassSecurityTrustHtml(this.displayTextRaw);
        this.charIndex++;
        setTimeout(() => this.typeText(), 2);
      } else {
  this.displayTextRaw += "\n";
  this.displayText = this.sanitizer.bypassSecurityTrustHtml(this.displayTextRaw);
        this.lineIndex++;
        this.charIndex = 0;
        setTimeout(() => this.typeText(), 10);
      }
    } else {
      // Typing finished: show cursor and mark finished
      this.cursorVisible = true;
      this.isTypingFinished = true;
      this.attachClickHandlers();
    }
  }

  attachClickHandlers(): void {
    if (this.isTypingFinished) {
  if (typeof document === 'undefined') return;
  const copyableSpans = this.elRef.nativeElement.querySelectorAll('.copyable:not([data-listener-added])');

      copyableSpans.forEach((span: HTMLElement) => {
        const email = span.innerText.trim();
        this.renderer.setAttribute(span, 'data-listener-added', 'true');
        this.renderer.listen(span, 'click', () => this.copyToClipboard(email));
        this.renderer.setStyle(span, 'cursor', 'pointer');
        this.renderer.setStyle(span, 'text-decoration', 'underline');
      });
      // Prevent re-adding listeners repeatedly
      this.isTypingFinished = false;
    }
  }

  copyToClipboard(email: string): void {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(email).then(() => {
      const msg = this.translate.instant('CONTACT.COPIED', { email });
      this.showModal(`📋 ${msg}`);
    }).catch(err => {
      console.error('Failed to copy email:', err);
      const msg = this.translate.instant('CONTACT.COPY_FAILED');
      this.showModal(msg);
    });
  }

  showModal(message: string): void {
    this.modalMessage = message;
    this.modalVisible = true;
    if (this.modalTimeout) {
      clearTimeout(this.modalTimeout);
    }
    this.modalTimeout = setTimeout(() => {
      this.hideModal();
      this.cdr.detectChanges(); // Ensure the view updates
    }, 2000);
  }

  hideModal(): void {
    this.modalVisible = false;
  }

  toggleCursorVisibility(): void {
    if (typeof document === 'undefined') return;
    const cursorElement = this.elRef.nativeElement.querySelector('.cursor');
    if (cursorElement) {
      if (this.cursorVisible) {
        cursorElement.classList.add('visible');
      } else {
        cursorElement.classList.remove('visible');
      }
    }
  }

  ngOnDestroy(): void {
    if (this.blinkIntervalId) {
      clearInterval(this.blinkIntervalId);
    }
    if (this.modalTimeout) {
      clearTimeout(this.modalTimeout);
    }
    if (this.ioObserver) {
      try { this.ioObserver.disconnect(); } catch (e) { /* ignore */ }
      this.ioObserver = null;
    }
  }
}
