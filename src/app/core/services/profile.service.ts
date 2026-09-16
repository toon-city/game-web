import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { UserProfile } from '@toon-live/game-types';
import { environment } from '../../../environments/environment';

/**
 * Player profile: HTTP (GET the full page, PUT description/job — reuses the
 * existing PUT /api/users/{id}, which already enforces self-or-admin via
 * UserPolicy) plus the shared "which profile is currently open" UI state,
 * same reasoning as InventoryService.startPlacing() holding cross-component
 * state instead of threading an @Output chain through every place a
 * profile can be opened from (navbar "my profile", a player-list row, ...).
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/users`;

  /** userId of the profile panel currently open, or null. */
  readonly openUserId = signal<string | null>(null);

  open(userId: string): void {
    this.openUserId.set(userId);
  }

  close(): void {
    this.openUserId.set(null);
  }

  get(userId: string): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.base}/${userId}/profile`);
  }

  updateDescription(userId: string, description: string, job: string): Observable<void> {
    return this.http.put<void>(`${this.base}/${userId}`, { description, job });
  }

  /** Toggles the "tenue de travail" overlay — same PUT endpoint, only self/admin allowed server-side. */
  setWorkOutfitActive(userId: string, active: boolean): Observable<void> {
    return this.http.put<void>(`${this.base}/${userId}`, { workOutfitActive: active });
  }
}
