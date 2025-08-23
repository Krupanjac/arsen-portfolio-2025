import { Component, ChangeDetectorRef, ElementRef, Renderer2, AfterViewChecked, ViewEncapsulation, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DomSanitizer } from '@angular/platform-browser';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, TranslateModule],
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
    ])
  ]
})
export class AboutComponent implements OnInit, AfterViewChecked, OnDestroy {
  aboutLines: string[] = [];
  displayText: any = '';
  displayTextRaw: string = '';
  cursorVisible: boolean = false;
  private lineIndex = 0;
  private charIndex = 0;
  private isTypingFinished = false;
  private typingTimeout: any = null;
  private langChangeSub: Subscription | null = null;

  modalVisible: boolean = false;
  modalMessage: string = '';
  private modalTimeout: any;
  private blinkIntervalId: any;

  constructor(
    private cdr: ChangeDetectorRef,
    private elRef: ElementRef,
    private renderer: Renderer2,
    private sanitizer: DomSanitizer,
    private translate: TranslateService
  ) {
    if (typeof window !== 'undefined') {
      this.blinkIntervalId = setInterval(() => {
        this.cdr.detectChanges();
        this.toggleCursorVisibility();
      }, 500);
    }
  }

  ngOnInit(): void {
    // Build lines using translations via helper so we can rebuild on language change
    this.buildAboutLines();

    // Subscribe to runtime language changes to rebuild and restart typing
    if (typeof window !== 'undefined') {
      this.langChangeSub = this.translate.onLangChange.subscribe(() => {
        this.restartTypingForLangChange();
      });
    }

    if (typeof window === 'undefined') {
      this.displayTextRaw = this.aboutLines.join('\n');
      this.displayText = this.sanitizer.bypassSecurityTrustHtml(this.displayTextRaw);
      this.isTypingFinished = true;
      return;
    }
    this.typeText();
  }

  private buildAboutLines(): void {
    this.aboutLines = [
      `C:> ${this.translate.instant('ABOUT.L1')}`,
      `C:> ${this.translate.instant('ABOUT.L2')}`,
      `C:> ${this.translate.instant('ABOUT.DOTS')}`,
      `C:> ${this.translate.instant('ABOUT.WHOAMI')}`,
      `C:> ${this.translate.instant('ABOUT.ROLE')}`,
      `C:> ${this.translate.instant('ABOUT.DOTS')}`,
      `C:> ${this.translate.instant('ABOUT.SKILLS')}`,
      `C:> ${this.translate.instant('ABOUT.SKILL_ALGO')}`,
      `C:> ${this.translate.instant('ABOUT.SKILL_DS')}`,
      `C:> ${this.translate.instant('ABOUT.SKILL_BACKEND')}`,
      `C:> ${this.translate.instant('ABOUT.SKILL_GAME')}`,
      `C:> ${this.translate.instant('ABOUT.SKILL_ML')}`,
      `C:> ${this.translate.instant('ABOUT.SKILL_FRONTEND')}`,
      `C:> ${this.translate.instant('ABOUT.DOTS')}`,
      `C:> ${this.translate.instant('ABOUT.LANGS')}`,
      `C:> ${this.translate.instant('ABOUT.LANG_LIST.PYTHON')}`,
      `C:> ${this.translate.instant('ABOUT.LANG_LIST.PASCAL')}`,
      `C:> ${this.translate.instant('ABOUT.LANG_LIST.C')}`,
      `C:> ${this.translate.instant('ABOUT.LANG_LIST.CPP')}`,
      `C:> ${this.translate.instant('ABOUT.LANG_LIST.UML')}`,
      `C:> ${this.translate.instant('ABOUT.LANG_LIST.JAVA')}`,
      `C:> ${this.translate.instant('ABOUT.LANG_LIST.CSHARP')}`,
      `C:> ${this.translate.instant('ABOUT.LANG_LIST.SQL')}`,
      `C:> ${this.translate.instant('ABOUT.LANG_LIST.JAVASCRIPT')}`,
      `C:> ${this.translate.instant('ABOUT.DOTS')}`,
      `C:> ${this.translate.instant('ABOUT.TOOLS')}`,
      `C:> ${this.translate.instant('ABOUT.TOOLS_LIST.GIT')}`,
      `C:> ${this.translate.instant('ABOUT.TOOLS_LIST.DOCKER')}`,
      `C:> ${this.translate.instant('ABOUT.TOOLS_LIST.VISUAL_STUDIO')}`,
      `C:> ${this.translate.instant('ABOUT.TOOLS_LIST.BOOTSTRAP')}`,
      `C:> ${this.translate.instant('ABOUT.AI')}`,
      `C:> ${this.translate.instant('ABOUT.DOTS')}`,
      `C:> ${this.translate.instant('ABOUT.CONTACT')}`,
      `C:> <a href="https://www.linkedin.com/in/arsendjurdjev/" class="copyable" data-link="LinkedIn" data-url="https://www.linkedin.com/in/arsendjurdjev/">${this.translate.instant('ABOUT.LINKEDIN')}</a>`,
      `C:> <a href="https://www.github.com/Krupanjac/" class="copyable" data-link="GitHub" data-url="https://www.github.com/Krupanjac/">${this.translate.instant('ABOUT.GITHUB')}</a>`,
      `C:> <a href="https://www.instagram.com/arsendjurdjev/" class="copyable" data-link="Instagram" data-url="https://www.instagram.com/arsendjurdjev/">${this.translate.instant('ABOUT.INSTAGRAM')}</a>`,
      'C:> <span class="copyable" data-email="arsen.djurdjev@live.com">arsen.djurdjev@live.com</span>'
    ];
  }

  private restartTypingForLangChange(): void {
    // clear any pending typing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
    // rebuild lines and reset state, then restart typing
    this.buildAboutLines();
    this.displayTextRaw = '';
    this.displayText = this.sanitizer.bypassSecurityTrustHtml('');
    this.lineIndex = 0;
    this.charIndex = 0;
    this.isTypingFinished = false;
    this.cursorVisible = false;
    this.typeText();
  }

  ngAfterViewChecked(): void {
    if (this.isTypingFinished && typeof document !== 'undefined') {
      this.attachClickHandlers();
    }
  }

  typeText(): void {
    if (this.lineIndex < this.aboutLines.length) {
      if (this.charIndex < this.aboutLines[this.lineIndex].length) {
        this.displayTextRaw += this.aboutLines[this.lineIndex][this.charIndex];
        this.displayText = this.sanitizer.bypassSecurityTrustHtml(this.displayTextRaw);
  this.charIndex++;
  this.typingTimeout = setTimeout(() => this.typeText(), 2);
      } else {
        this.displayTextRaw += '\n';
        this.displayText = this.sanitizer.bypassSecurityTrustHtml(this.displayTextRaw);
        this.lineIndex++;
  this.charIndex = 0;
  this.typingTimeout = setTimeout(() => this.typeText(), 10);
      }
    } else {
      this.cursorVisible = true;
      this.isTypingFinished = true;
      this.attachClickHandlers();
    }
  }

  attachClickHandlers(): void {
    if (this.isTypingFinished) {
      if (typeof document === 'undefined') return;
      const copyableSpans = this.elRef.nativeElement.querySelectorAll('.copyable:not([data-listener-added])');
      copyableSpans.forEach((el: HTMLElement) => {
        const email = el.getAttribute('data-email');
        const url = el.getAttribute('data-url');
        this.renderer.setAttribute(el, 'data-listener-added', 'true');
        if (email) {
          this.renderer.listen(el, 'click', () => this.copyToClipboard(email));
          this.renderer.setStyle(el, 'cursor', 'pointer');
          this.renderer.setStyle(el, 'text-decoration', 'underline');
        } else if (url) {
          this.renderer.listen(el, 'click', () => { window.open(url!, '_blank'); });
          this.renderer.setStyle(el, 'cursor', 'pointer');
          this.renderer.setStyle(el, 'text-decoration', 'underline');
        }
      });
      this.isTypingFinished = false; // prevent re-adding
    }
  }

  copyToClipboard(text: string): void {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      const msg = this.translate.instant('CONTACT.COPIED', { email: text });
      this.showModal(`📋 ${msg}`);
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
    if (this.blinkIntervalId) clearInterval(this.blinkIntervalId);
    if (this.modalTimeout) clearTimeout(this.modalTimeout);
  if (this.typingTimeout) clearTimeout(this.typingTimeout);
  if (this.langChangeSub) this.langChangeSub.unsubscribe();
  }
}
