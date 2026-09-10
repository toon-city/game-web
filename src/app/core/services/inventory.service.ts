import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject, tap } from 'rxjs';
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

  /** Émis après chaque equip/unequip réussi — indépendant d'être en room ou
   *  non (ex: le badge avatar de la carte d'identité, affiché partout). */
  readonly equippedChanged$ = new Subject<void>();

  /**
   * Défini par GameCanvasComponent pendant qu'on est en room : démarre le
   * placement (fantôme + drag) d'un meuble depuis l'inventaire. Même
   * indirection que onClothingChanged — le panneau inventaire est un overlay
   * top-level (app.component.html), pas un enfant du canvas de jeu.
   */
  onPlaceFurniture: ((item: UserItemInfo) => void) | null = null;

  /** Pas d'appel réseau ici : le placement se confirme entièrement via STOMP (voir startPlacingFurniture côté GameCanvasComponent). */
  startPlacing(item: UserItemInfo): void {
    this.onPlaceFurniture?.(item);
  }

  listItems(type?: ItemType, page = 0): Observable<PagedResult<UserItemInfo>> {
    let params = new HttpParams().set('page', page);
    if (type) params = params.set('type', type);
    return this.http.get<PagedResult<UserItemInfo>>(this.base, { params });
  }

  /** Vêtements actuellement équipés : spriteKey (catégorie) → spritePath (id). */
  getEquipped(): Observable<Record<string, string>> {
    return this.http.get<Record<string, string>>(`${this.base}/equipped`);
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
    this.equippedChanged$.next();
  }
}
