import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CreateTradeOfferRequest, ItemInfo, ItemSubType, ItemType, TradeOffer, TradeSortOption } from '@toon-live/game-types';
import { environment } from '../../../environments/environment';
import { PagedResult } from './inventory.service';

/** HTTP + "is the panel open" UI state bundled together, same reasoning as ProfileService/MetierService. */
@Injectable({ providedIn: 'root' })
export class TradeService {
  private readonly http = inject(HttpClient);
  private readonly tradesBase = `${environment.apiUrl}/trades`;
  private readonly itemsBase = `${environment.apiUrl}/items`;

  readonly panelOpen = signal(false);

  openPanel(): void {
    this.panelOpen.set(true);
  }

  closePanel(): void {
    this.panelOpen.set(false);
  }

  /** Onglet "Échanges" — place de marché publique, exclut mes propres offres. */
  listMarket(search: string | undefined, itemType: ItemType | undefined, sort: TradeSortOption | undefined, page: number): Observable<PagedResult<TradeOffer>> {
    let params = new HttpParams().set('page', page);
    if (search) params = params.set('search', search);
    if (itemType) params = params.set('itemType', itemType);
    if (sort) params = params.set('sort', sort);
    return this.http.get<PagedResult<TradeOffer>>(this.tradesBase, { params });
  }

  /** Onglet "Mes propositions". */
  listMine(): Observable<TradeOffer[]> {
    return this.http.get<TradeOffer[]>(`${this.tradesBase}/mine`);
  }

  /** Onglet "Historique". */
  listHistory(): Observable<TradeOffer[]> {
    return this.http.get<TradeOffer[]>(`${this.tradesBase}/history`);
  }

  propose(req: CreateTradeOfferRequest): Observable<TradeOffer> {
    return this.http.post<TradeOffer>(this.tradesBase, req);
  }

  cancel(id: number): Observable<void> {
    return this.http.post<void>(`${this.tradesBase}/${id}/cancel`, {});
  }

  accept(id: number): Observable<TradeOffer> {
    return this.http.post<TradeOffer>(`${this.tradesBase}/${id}/accept`, {});
  }

  /** Catalogue complet (pas juste mon inventaire) — pour choisir "quel objet je veux recevoir" en proposant un échange. */
  searchItemCatalog(search: string | undefined, itemType: ItemType | undefined, subType: ItemSubType | undefined): Observable<PagedResult<ItemInfo>> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    if (itemType) params = params.set('itemType', itemType);
    if (subType) params = params.set('subType', subType);
    return this.http.get<PagedResult<ItemInfo>>(this.itemsBase, { params });
  }
}
