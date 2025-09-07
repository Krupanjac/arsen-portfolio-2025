// Language: TypeScript
import { Component, ChangeDetectorRef, ElementRef, Renderer2, ViewEncapsulation, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { TerminalTypingDirective } from '../shared/terminal-typing.directive';
import { TooltipDirective } from '../shared/tooltip.directive';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, TranslateModule, TerminalTypingDirective, TooltipDirective],
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss'],
  encapsulation: ViewEncapsulation.None,
  animations: [
    trigger('toastAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(6px)' }),
        animate('220ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('180ms ease-in', style({ opacity: 0, transform: 'translateY(6px)' }))
      ])
    ])
  ]
})
export class ContactComponent implements OnInit, OnDestroy {
  // Public props used by template
  email = 'contact@krupanjac.dev';
  // Toast state
  toastVisible: boolean = false;
  toastMessage: string = '';
  private toastTimeout: any;

  constructor(
    private cdr: ChangeDetectorRef,
    private elRef: ElementRef,
    private renderer: Renderer2,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {}

  copyToClipboard(text: string): void {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      const msg = this.translate.instant('CONTACT.COPIED', { email: text });
      this.showToast(`${msg}`);
    }).catch(() => {
      const msg = this.translate.instant('CONTACT.COPY_FAILED');
      this.showToast(msg);
    });
  }

  showToast(message: string): void {
    this.toastMessage = message;
    this.toastVisible = true;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastVisible = false;
      this.cdr.detectChanges();
    }, 1600);
  }

  ngOnDestroy(): void {
  if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }
}
 
