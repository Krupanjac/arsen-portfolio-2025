import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [RouterModule, CommonModule, TranslateModule],
  // No custom providers
  templateUrl: './nav.component.html',
  styleUrls: ['./nav.component.scss']
})
export class NavComponent {
  isNavOpen = false;
  isLangLoading = false;

  toggleNav(): void {
    this.isNavOpen = !this.isNavOpen;
  }

  constructor(private translate: TranslateService) {
    // Ensure a language is set at startup
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('lang') : null;
    const lang = stored || 'en';
    this.translate.use(lang);
  }

  setLang(lang: 'en' | 'sr') {
    const current = (this.translate as any).getCurrentLang ? (this.translate as any).getCurrentLang() : null;
    if (current === lang || this.isLangLoading) {
      return;
    }
    this.isLangLoading = true;
    this.translate.use(lang).subscribe({
      next: () => {
        this.isLangLoading = false;
        try { localStorage.setItem('lang', lang); } catch {}
      },
      error: () => {
        this.isLangLoading = false;
      }
    });
  }
}