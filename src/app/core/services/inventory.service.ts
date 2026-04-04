import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { UserItemInfo, ItemType } from '@toon-live/game-types';
import { environment } from '../../../environments/environment';

export interface PagedResult<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory`;

  /** roomId courant — à positionner par le composant jeu avant d'équiper/déséquiper. */
  currentRoomId: string | null = null;

  /** Callback appelé après equip/unequip pour notifier le serveur de jeu. */
  onClothingChanged: ((roomId: string) => void) | null = null;

  listItems(type?: ItemType, page = 0): Observable<PagedResult<UserItemInfo>> {
    let params = new HttpParams().set('page', page);
    if (type) params = params.set('type', type);
    return this.http.get<PagedResult<UserItemInfo>>(this.base, { params });
  }

  equip(userItemId: number): Observable<UserItemInfo> {
    return this.http.put<UserItemInfo>(`${this.base}/${userItemId}/equip`, {}).pipe(
      tap(() => this._notifyClothingChanged()),
    );
  }

  unequip(userItemId: number): Observable<UserItemInfo> {
    return this.http.put<UserItemInfo>(`${this.base}/${userItemId}/unequip`, {}).pipe(
      tap(() => this._notifyClothingChanged()),
    );
  }

  private _notifyClothingChanged(): void {
    if (this.currentRoomId && this.onClothingChanged) {
      this.onClothingChanged(this.currentRoomId);
    }
  }
}
