import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarkdownPipe } from '../shared/markdown.pipe';
import { BlogPost } from '../blog.service';
import { ImagekitService } from '../imagekit.service';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-blog-modal',
  standalone: true,
  imports: [CommonModule, MarkdownPipe],
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
  // Measured natural size of the current image
  private naturalWidth: number | null = null;
  private naturalHeight: number | null = null;
  // Computed display box size to fit viewport
  imageBox = { width: 0, height: 0 };
  // Touch/swipe support
  private touchStartX: number | null = null;
  private touchStartY: number | null = null;
  private readonly swipeThreshold = 50; // px

  constructor(private imagekitService: ImagekitService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      if (this.visible) {
        this.lockScroll();
  // compute an initial image box size
  setTimeout(() => this.updateImageBox());
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

  @HostListener('window:resize')
  onResize() {
    this.updateImageBox();
  }

  close(): void {
    this.closeModal.emit();
  }

  nextImage(): void {
    if (this.post?.images && this.currentImageIndex < this.post.images.length - 1) {
      this.currentImageIndex++;
      // reset size; will recompute on load
      this.naturalWidth = this.naturalHeight = null;
    }
  }

  prevImage(): void {
    if (this.currentImageIndex > 0) {
      this.currentImageIndex--;
      this.naturalWidth = this.naturalHeight = null;
    }
  }

  goToImage(index: number): void {
    if (!this.post?.images) return;
    if (index < 0 || index >= this.post.images.length) return;
    this.currentImageIndex = index;
    this.naturalWidth = this.naturalHeight = null;
  }

  // Get responsive image URLs for modal display
  getModalImageUrls(imageUrl: string) {
    if (!imageUrl) return { src: '', srcset: '', sizes: '' };
    // If it's already an ImageKit URL, use the service to generate responsive version
    if (imageUrl.includes('ik.imagekit.io')) {
      return this.imagekitService.getModalImageUrls(imageUrl);
    }
    // Otherwise return the original URL
    return { src: imageUrl, srcset: '', sizes: '' };
  }

  // Thumbnail URL (smaller, optimized)
  getThumbUrl(imageUrl: string): string {
    if (!imageUrl) return '';
    if (imageUrl.includes('ik.imagekit.io')) {
      return this.imagekitService.getPreviewImageUrls(imageUrl, { width: 160, height: 100, quality: 60 });
    }
    return imageUrl;
  }

  // On image load, capture natural size and compute display size
  onImageLoad(e: Event) {
    const img = e.target as HTMLImageElement;
    if (!img) return;
    this.naturalWidth = img.naturalWidth || null;
    this.naturalHeight = img.naturalHeight || null;
    this.updateImageBox();
  }

  // Calculate the image box to match the image aspect while fitting viewport
  private updateImageBox() {
    // Fallbacks if we don't yet know natural dims
    const nw = this.naturalWidth ?? 1280;
    const nh = this.naturalHeight ?? 720;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    // Modal padding/margins approximations
    const maxW = Math.min(vw * 0.85, 1100);
    const maxH = Math.min(vh * 0.7, 900);
    const scale = Math.min(maxW / nw, maxH / nh, 1);
    this.imageBox.width = Math.floor(nw * scale);
    this.imageBox.height = Math.floor(nh * scale);
  }

  // Touch handlers for swipe navigation
  onTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }
  onTouchEnd(e: TouchEvent) {
    if (this.touchStartX == null || this.touchStartY == null) return;
    const dx = (e.changedTouches[0]?.clientX || 0) - this.touchStartX;
    const dy = (e.changedTouches[0]?.clientY || 0) - this.touchStartY;
    // Only treat as swipe if mostly horizontal
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > this.swipeThreshold) {
      if (dx < 0) this.nextImage(); else this.prevImage();
    }
    this.touchStartX = this.touchStartY = null;
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
