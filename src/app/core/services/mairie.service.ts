import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MairieStatus, JustMarried } from '@toon-live/game-types';
import { environment } from '../../../environments/environment';
import { UserListItem, UserPage } from './user-list.service';

/**
 * Marriage proposals + pez->kred conversion. Plain REST (unlike the
 * room-scoped kick/ban/private-message trio, a proposal must work even
 * offline — no live-session requirement, so no STOMP involved at all).
 */
@Injectable({ providedIn: 'root' })
export class MairieService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/mairie`;

  status(): Observable<MairieStatus> {
    return this.http.get<MairieStatus>(`${this.base}/status`);
  }

  /** null when nobody has ever gotten married (204 No Content — Angular resolves an empty JSON body to null). */
  lastMarried(): Observable<JustMarried | null> {
    return this.http.get<JustMarried | null>(`${this.base}/last-married`);
  }

  /**
   * Own HTTP call to /api/users rather than reusing UserListService — that
   * service's `page` signal is shared with StatusBarComponent's player
   * panel; searching from here would silently overwrite that panel's list
   * if both happened to be open. Same backend endpoint, separate state.
   */
  search(q: string, page = 0, size = 15): Observable<UserPage> {
    const params = new HttpParams().set('q', q).set('page', page).set('size', size);
    return this.http.get<UserPage>(`${environment.apiUrl}/users`, { params });
  }

  propose(toUserId: string, ringUserItemId: number): Observable<void> {
    return this.http.post<void>(`${this.base}/propose`, { toUserId, ringUserItemId });
  }

  accept(proposalId: number): Observable<void> {
    return this.http.post<void>(`${this.base}/proposals/${proposalId}/accept`, {});
  }

  decline(proposalId: number): Observable<void> {
    return this.http.post<void>(`${this.base}/proposals/${proposalId}/decline`, {});
  }

  cancel(proposalId: number): Observable<void> {
    return this.http.post<void>(`${this.base}/proposals/${proposalId}/cancel`, {});
  }

  convert(pezAmount: number): Observable<void> {
    return this.http.post<void>(`${this.base}/convert`, { pezAmount });
  }
}

// Re-exported for consumers that only need the result shape, not the service.
export type { UserListItem };
