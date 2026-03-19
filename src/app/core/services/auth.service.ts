import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { UserInfo } from '@toon-live/game-types';
import { environment } from '../../../environments/environment';

export interface LoginResponse {
  token: string;
  userId: string;
  username: string;
}

const TOKEN_KEY = 'toon_token';
const USER_KEY = 'toon_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiBase = environment.apiUrl;

  private _token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private _user = signal<UserInfo | null>(
    (() => {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as UserInfo) : null;
    })(),
  );

  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._token());

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {}

  login(username: string, password: string) {
    return this.http
      .post<LoginResponse>(`${this.apiBase}/auth/token`, { username, password })
      .pipe(tap((res) => this._storeSession(res)));
  }

  register(username: string, password: string, gender: string, email: string) {
    return this.http
      .post<LoginResponse>(`${this.apiBase}/auth/register`, { username, password, gender, email })
      .pipe(tap((res) => this._storeSession(res)));
  }

  private _storeSession(res: LoginResponse): void {
    localStorage.setItem(TOKEN_KEY, res.token);
    this._token.set(res.token);
    const user: UserInfo = { id: res.userId, username: res.username, avatarOptions: {} };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this._user.set(user);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._token.set(null);
    this._user.set(null);
    this.router.navigate(['/login']);
  }
}
