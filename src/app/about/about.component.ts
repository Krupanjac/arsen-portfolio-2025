import { Component, AfterViewInit, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss']
})
export class AboutComponent implements AfterViewInit {
  constructor(private renderer: Renderer2) {}

  ngAfterViewInit(): void {
    // Skip on the server during SSR
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    // Add click event to email address to copy to clipboard.
    const emailLink = document.getElementById('email-address');
    if (emailLink) {
      emailLink.addEventListener('click', (e) => {
        e.preventDefault();
        const email = emailLink.textContent || '';
        navigator.clipboard.writeText(email).then(() => {
          this.showNotification("Email address copied to clipboard");
        }).catch(err => console.error('Copy failed: ', err));
      });
    }
  }

  showNotification(message: string) {
    const notification = this.renderer.createElement('div');
    this.renderer.addClass(notification, 'copy-notification');
    const currentScrollY = window.scrollY;
    this.renderer.setStyle(notification, 'top', `${currentScrollY + 50}px`);
    this.renderer.setStyle(notification, 'left', '50%');
    this.renderer.setStyle(notification, 'transform', 'translateX(-50%)');
    this.renderer.setProperty(notification, 'textContent', message);
    this.renderer.appendChild(document.body, notification);
    setTimeout(() => {
      this.renderer.removeChild(document.body, notification);
    }, 1500);
  }
}
