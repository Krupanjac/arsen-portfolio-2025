import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BlogPost } from '../blog.service';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-blog-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './blog-modal.component.html',
  styleUrls: ['./blog-modal.component.scss'],
  animations: [
    trigger('modalAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.95)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'scale(0.95)' }))
      ])
    ])
  ]
})
export class BlogModalComponent implements OnChanges, OnDestroy {
  @Input() post: BlogPost | null = null;
  @Input() visible: boolean = false;
  @Output() closeModal = new EventEmitter<void>();

  currentImageIndex: number = 0;
  private _savedScrollY: number = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      if (this.visible) {
        this.lockScroll();
      } else {
        this.unlockScroll();
      }
    }
  }

  ngOnDestroy(): void {
    this.unlockScroll();
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (!this.visible) return;

    switch (event.key) {
      case 'Escape':
        this.close();
        break;
      case 'ArrowLeft':
        this.prevImage();
        break;
      case 'ArrowRight':
        this.nextImage();
        break;
    }
  }

  close(): void {
    this.closeModal.emit();
  }

  nextImage(): void {
    if (this.post?.images && this.currentImageIndex < this.post.images.length - 1) {
      this.currentImageIndex++;
    }
  }

  prevImage(): void {
    if (this.currentImageIndex > 0) {
      this.currentImageIndex--;
    }
  }

  goToImage(index: number): void {
    this.currentImageIndex = index;
  }

  onOverlayClick(event: Event): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  private lockScroll(): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    try {
      this._savedScrollY = window.scrollY || window.pageYOffset || 0;
      document.body.style.top = `-${this._savedScrollY}px`;
      document.body.classList.add('modal-open');
    } catch {}
  }

  private unlockScroll(): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    try {
      document.body.classList.remove('modal-open');
      const y = this._savedScrollY || 0;
      document.body.style.top = '';
      window.scrollTo(0, y);
      this._savedScrollY = 0;
    } catch {}
  }
}
