import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ShopItemInfo, ShopIdType, CollectionInfo, UserItemInfo, BuyOption } from '@toon-live/game-types';
import { environment } from '../../../environments/environment';
import { PagedResult } from './inventory.service';

@Injectable({ providedIn: 'root' })
export class ShopService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  listItems(shopId: ShopIdType, collectionId?: number, page = 0): Observable<PagedResult<ShopItemInfo>> {
    let params = new HttpParams().set('page', page);
    if (collectionId != null) params = params.set('collectionId', collectionId);
    return this.http.get<PagedResult<ShopItemInfo>>(
      `${this.base}/shops/${shopId}/items`,
      { params }
    );
  }

  listCollections(shopId: ShopIdType): Observable<CollectionInfo[]> {
    return this.http.get<CollectionInfo[]>(`${this.base}/shops/${shopId}/collections`);
  }

  buy(shopId: ShopIdType, shopItemId: number, option: BuyOption): Observable<UserItemInfo> {
    return this.http.post<UserItemInfo>(
      `${this.base}/shops/${shopId}/items/${shopItemId}/buy`,
      { option }
    );
  }
}
