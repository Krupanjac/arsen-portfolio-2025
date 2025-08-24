import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoginService } from './login.service';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  username = '';
  password = '';
  loading = false;
  error: string | null = null;
  success = false;
  // Turnstile token supplied by widget
  turnstileToken: string | null = null;
  private _widgetId: any = null;
  private readonly siteKey = '0x4AAAAAABulTpKICOIfLXfy';

  constructor(
    private loginService: LoginService,
    private router: Router,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    // Dynamically load Turnstile script if not present and render widget
    const win = window as any;
    const renderWidget = () => {
      try {
        this._widgetId = win.turnstile.render(document.getElementById('turnstile-container'), {
          sitekey: this.siteKey,
          callback: (token: string) => {
            this.turnstileToken = token;
          },
          'expired-callback': () => {
            this.turnstileToken = null;
          }
        });
      } catch (e) {
        // ignore render errors
      }
    };

    if (win.turnstile) {
      renderWidget();
    } else {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      s.defer = true;
      s.onload = renderWidget;
      document.head.appendChild(s);
    }
  }

  ngOnDestroy(): void {
    // no-op for now; widget will be removed with DOM
  }

  submit() {
    // Prevent submitting before Turnstile challenge completes
    if (!this.turnstileToken) {
      this.error = this.translate.instant('LOGIN.COMPLETE_CHALLENGE');
      return;
    }

    this.error = null;
    this.success = false;
    this.loading = true;
  // include Turnstile token
  this.loginService.login(this.username, this.password, this.turnstileToken ?? '').subscribe({
      next: (res) => {
        this.loading = false;
        this.success = true;
  try { window.dispatchEvent(new CustomEvent('auth:login')); } catch {}
        // Navigate to protected admin area after successful login
        try {
          this.router.navigate(['/admin']);
        } catch (e) {
          // ignore navigation errors here; component will show success state
        }
      },
      error: (err) => {
        this.loading = false;
        // Prefer backend error text, otherwise use a translated fallback
        this.error = err?.error || err?.message || this.translate.instant('LOGIN.FAILED');
      },
    });
  }
}
