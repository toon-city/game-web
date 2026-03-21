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
  gender: string | null;
  rank: number;
  toonizLevel: number;
  kreds: number;
  pez: number;
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
  readonly isLoggedIn = computed(() => {
    const t = this._token();
    if (!t) return false;
    return !this._isJwtExpired(t);
  });

  /** Decode the JWT payload and check the `exp` claim (no signature verification). */
  private _isJwtExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
    } catch {
      return true; // malformed → treat as expired
    }
  }

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {
    // Vider les sessions avec un ancien format de JWT (sans les claims rank/toonizLevel)
    // pour forcer une reconnexion et obtenir un nouveau token avec tous les champs.
    const t = this._token();
    if (t && !this._isJwtExpired(t)) {
      try {
        const payload = JSON.parse(atob(t.split('.')[1]));
        if (!('rank' in payload)) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          this._token.set(null);
          this._user.set(null);
        }
      } catch { /* token malformé — isLoggedIn retournera false */ }
    }
  }

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
    const user: UserInfo = {
      id: res.userId,
      username: res.username,
      gender: res.gender ?? null,
      rank: res.rank ?? 0,
      toonizLevel: res.toonizLevel ?? 0,
      kreds: res.kreds ?? 0,
      pez: res.pez ?? 1500,
      avatarOptions: {},
    };
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

  /**
   * Rafraîchit les données utilisateur depuis le serveur (kreds, pez, rang…).
   * Appelé au chargement de l'app et après toute opération modifiant les monnaies.
   */
  refreshUser(): void {
    if (!this.isLoggedIn()) return;
    this.http.get<LoginResponse>(`${this.apiBase}/auth/me`).subscribe({
      next: res => {
        const current = this._user();
        if (!current) return;
        const updated: import('@toon-live/game-types').UserInfo = {
          ...current,
          kreds: res.kreds ?? current.kreds,
          pez: res.pez ?? current.pez,
          rank: res.rank ?? current.rank,
          toonizLevel: res.toonizLevel ?? current.toonizLevel,
          gender: res.gender ?? current.gender,
        };
        localStorage.setItem(USER_KEY, JSON.stringify(updated));
        this._user.set(updated);
      },
      error: () => {},
    });
  }
}
