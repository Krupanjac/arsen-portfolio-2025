import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LoginService {
  constructor(private http: HttpClient) {}

  login(username: string, password: string) {
    const body = { username, password };
    const opts = { withCredentials: true } as const;

    return this.http.post('/api/login', body, opts).pipe(
      catchError((err) => {
        // Fallback to common serverless function path used on some hosts
        return this.http.post('/.netlify/functions/login', body, opts).pipe(
          catchError((err2) => throwError(() => err))
        );
      })
    );
  }
}
