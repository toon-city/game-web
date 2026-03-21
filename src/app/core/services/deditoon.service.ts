import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Deditoon {
  id: number;
  authorUsername: string;
  /** MALE | FEMALE | NON_BINARY | null */
  authorGender: string | null;
  message: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class DeditoonService {
  private readonly base = environment.apiUrl;

  readonly deditoons = signal<Deditoon[]>([]);

  constructor(private readonly http: HttpClient) {}

  refresh(): void {
    this.http.get<Deditoon[]>(`${this.base}/deditoons`).subscribe({
      next: data => this.deditoons.set(data),
      error: (e) => console.error('[DeditoonService] Erreur chargement:', e),
    });
  }

  /** Prépend immédiatement une nouvelle déditoon (mise à jour optimiste). */
  prepend(d: Deditoon): void {
    this.deditoons.update(list => [d, ...list].slice(0, 10));
  }

  post(message: string): Observable<Deditoon> {
    return this.http.post<Deditoon>(`${this.base}/deditoons`, { message });
  }
}
