import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';
import { SafeUrlPipe } from './safe-url.pipe';

@Component({
  selector: 'app-resume-modal',
  standalone: true,
  imports: [CommonModule, SafeUrlPipe],
  templateUrl: './resume-modal.component.html',
  styleUrls: ['./resume-modal.component.scss'],
  animations: [
    trigger('modalAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(.95)' }),
        animate('180ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ]),
      transition(':leave', [
        animate('160ms ease-in', style({ opacity: 0, transform: 'scale(.95)' }))
      ])
    ])
  ]
})
export class ResumeModalComponent implements OnChanges {
  @Input() visible = false;
  @Output() close = new EventEmitter<void>();
  pdfPath = '/Arsen_Djurdjev_Resume.pdf';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      if (this.visible) this.lockScroll(); else this.unlockScroll();
    }
  }

  onOverlayClick(e: Event) {
    if (e.target === e.currentTarget) this.closeModal();
  }

  closeModal() { this.close.emit(); }

  private lockScroll() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    document.body.classList.add('modal-open');
  }
  private unlockScroll() {
    if (typeof document === 'undefined') return;
    document.body.classList.remove('modal-open');
  }
}
