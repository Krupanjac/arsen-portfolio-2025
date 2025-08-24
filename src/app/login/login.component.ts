import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoginService } from './login.service';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

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

  constructor(private loginService: LoginService, private router: Router) {}

  submit() {
    this.error = null;
    this.success = false;
    this.loading = true;
    this.loginService.login(this.username, this.password).subscribe({
      next: (res) => {
        this.loading = false;
        this.success = true;
        // Navigate to protected admin area after successful login
        try {
          this.router.navigate(['/admin']);
        } catch (e) {
          // ignore navigation errors here; component will show success state
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error || err?.message || 'Login failed';
      },
    });
  }
}
