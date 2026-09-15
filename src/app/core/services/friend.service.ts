import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FriendsStatus } from '@toon-live/game-types';
import { environment } from '../../../environments/environment';
import { UserPage } from './user-list.service';

/**
 * Friends + blacklist. Plain REST, same reasoning as MairieService — a
 * friend request/block must work even if the other side is offline, no
 * live-session requirement to route through game-server-java for.
 */
@Injectable({ providedIn: 'root' })
export class FriendService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/friends`;

  status(): Observable<FriendsStatus> {
    return this.http.get<FriendsStatus>(`${this.base}/status`);
  }

  /**
   * Own HTTP call to /api/users rather than reusing UserListService — same
   * reasoning as MairieService.search(): that service's `page` signal is
   * shared with StatusBarComponent's player panel, searching from here
   * would silently overwrite it if both are open at once.
   */
  search(q: string, page = 0, size = 15): Observable<UserPage> {
    const params = new HttpParams().set('q', q).set('page', page).set('size', size);
    return this.http.get<UserPage>(`${environment.apiUrl}/users`, { params });
  }

  sendRequest(userId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/requests`, { userId });
  }

  accept(requestId: number): Observable<void> {
    return this.http.post<void>(`${this.base}/requests/${requestId}/accept`, {});
  }

  decline(requestId: number): Observable<void> {
    return this.http.post<void>(`${this.base}/requests/${requestId}/decline`, {});
  }

  cancel(requestId: number): Observable<void> {
    return this.http.post<void>(`${this.base}/requests/${requestId}/cancel`, {});
  }

  removeFriend(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${userId}`);
  }

  block(userId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/blocks`, { userId });
  }

  unblock(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/blocks/${userId}`);
  }
}
