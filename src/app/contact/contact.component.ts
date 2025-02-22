// Language: TypeScript
import { Component, ChangeDetectorRef, ElementRef, Renderer2, AfterViewChecked, ViewEncapsulation, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule],
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
export class ContactComponent implements OnInit, AfterViewChecked {
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

  constructor(
    private cdr: ChangeDetectorRef,
    private elRef: ElementRef,
    private renderer: Renderer2,
    private sanitizer: DomSanitizer
  ) {
    // Start the typewriter effect immediately
    setInterval(() => {
      this.cdr.detectChanges();
      this.toggleCursorVisibility();
    }, 500);
  }

  ngOnInit(): void {
    // Hardcoded contact lines (with embedded emails in span.copyable)
    this.contactLines = [
      `root@terminal:~$ E-MAIL - <span class="copyable" data-email="arsen.djurdjev@live.com">arsen.djurdjev@live.com</span>`,
      'root@terminal:~$ '
    ];
    this.typeText();
  }

  ngAfterViewChecked(): void {
    if (this.isTypingFinished) {
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
    navigator.clipboard.writeText(email).then(() => {
      this.showModal(`📋 Kopirano: ${email}`);
    }).catch(err => {
      console.error('Failed to copy email:', err);
      this.showModal('Failed to copy text.');
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
    const cursorElement = this.elRef.nativeElement.querySelector('.cursor');
    if (cursorElement) {
      if (this.cursorVisible) {
        cursorElement.classList.add('visible');
      } else {
        cursorElement.classList.remove('visible');
      }
    }
  }
}
