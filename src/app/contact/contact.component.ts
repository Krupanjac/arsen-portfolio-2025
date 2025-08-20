// Language: TypeScript
import { Component, ChangeDetectorRef, ElementRef, Renderer2, AfterViewChecked, ViewEncapsulation, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslateService } from '@ngx-translate/core';
import { TranslateModule } from '@ngx-translate/core';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.css'],
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
export class ContactComponent implements OnInit, AfterViewChecked, OnDestroy {
  contactLines: string[] = [];
  displayText: string = "";
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
      this.displayText = this.contactLines.join('\n');
      this.isTypingFinished = true;
      return;
    }
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
        this.displayText += this.contactLines[this.lineIndex][this.charIndex];
        this.charIndex++;
        setTimeout(() => this.typeText(), 2);
      } else {
        this.displayText += "\n";
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
  }
}
