import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, catchError, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _authenticated = false;
  private _username: string | null = null;

  constructor(private http: HttpClient) {}

  checkSession() {
    // Try primary path then fallback (same as LoginService pattern)
    return this.http.get('/api/session', { withCredentials: true }).pipe(
      map((res: any) => {
        this._authenticated = !!res?.authenticated;
        this._username = res?.username || null;
        return res;
      }),
      catchError(() => {
        return this.http.get('/.netlify/functions/session', { withCredentials: true }).pipe(
          map((res: any) => {
            this._authenticated = !!res?.authenticated;
            this._username = res?.username || null;
            return res;
          }),
          catchError(() => of({ authenticated: false }))
        );
      })
    );
  }

  get authenticated() {
    return this._authenticated;
  }

  get username() {
    return this._username;
  }
}
