import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { finalize } from 'rxjs/operators';
import { ItemInfo, ItemSubType, ItemType, TradeOffer, TradeSortOption, UserItemInfo } from '@toon-live/game-types';
import { TradeService } from '../../../core/services/trade.service';
import { InventoryService } from '../../../core/services/inventory.service';
import { AuthService } from '../../../core/services/auth.service';
import { DialogStackService } from '../../../core/services/dialog-stack.service';

type TradeTab = 'market' | 'mine' | 'history';

/** "Tous" always included, per l'utilisateur — jamais juste un sous-ensemble contextuel. */
export const ITEM_TYPE_FILTER_OPTIONS: { value: ItemType | ''; label: string }[] = [
  { value: '', label: 'Tous types' },
  { value: 'CLOTHING', label: 'Vêtements' },
  { value: 'FURNITURE', label: 'Meubles' },
  { value: 'MISC', label: 'Divers' },
];

export const ITEM_SUBTYPE_FILTER_OPTIONS: { value: ItemSubType | ''; label: string }[] = [
  { value: '', label: 'Tous sous-types' },
  { value: 'HAIRSTYLE', label: 'Coiffure' },
  { value: 'HAT', label: 'Chapeau' },
  { value: 'TOP', label: 'Haut' },
  { value: 'BOTTOM', label: 'Bas' },
  { value: 'MAKEUP', label: 'Maquillage' },
  { value: 'RING', label: 'Bague' },
  { value: 'FLOOR', label: 'Sol' },
  { value: 'WALL', label: 'Mur' },
  { value: 'WALLPAPER', label: 'Papier peint' },
  { value: 'PIECE', label: 'Meuble' },
  { value: 'OTHER', label: 'Autre' },
];

/**
 * Centre d'échange — place de marché publique : je propose "mon item
 * (+pez) contre un TYPE d'item précis (+pez)", n'importe qui possédant un
 * exemplaire non équipé du type demandé peut accepter (pas une offre
 * ciblée). Éligibilité à "Accepter" volontairement non précalculée côté
 * client (croiser chaque offre avec tout mon inventaire serait coûteux
 * pour peu de valeur) — le bouton est toujours cliquable, le serveur
 * renvoie un message clair en cas d'échec.
 */
@Component({
  selector: 'app-trade-center',
  standalone: true,
  imports: [FormsModule, DragDropModule],
  templateUrl: './trade-center.component.html',
  styleUrls: ['./trade-center.component.scss'],
})
export class TradeCenterComponent implements OnInit, OnDestroy {
  private readonly tradeService = inject(TradeService);
  private readonly inventoryService = inject(InventoryService);
  private readonly auth = inject(AuthService);
  private readonly dialogStack = inject(DialogStackService);
  private readonly dialogId = this.dialogStack.newInstanceId();

  zIndex = signal(100);
  /** On-open position (centered by default) — see DialogStackService.open()
   *  for why this isn't `left: 50%; transform: translateX(-50%)` in the
   *  SCSS anymore: cdkDrag overwrites `style.transform` the instant a drag
   *  starts, silently discarding that centering and making the panel jump. */
  pos = signal({ top: 70, left: 0 });
  activeTab = signal<TradeTab>('market');

  // ── Échanges (marché) ──────────────────────────────────────────────────────
  marketResults = signal<TradeOffer[]>([]);
  marketLoading = signal(false);
  marketPage = signal(0);
  marketTotalPages = signal(0);
  marketSearch = '';
  marketItemType: ItemType | '' = '';
  marketSort: TradeSortOption = 'newest';
  actionBusyId = signal<number | null>(null);
  actionError = signal<string | null>(null);

  // ── Mes propositions ─────────────────────────────────────────────────────
  mine = signal<TradeOffer[]>([]);
  mineLoading = signal(false);

  // ── Historique ────────────────────────────────────────────────────────────
  history = signal<TradeOffer[]>([]);
  historyLoading = signal(false);

  // ── Proposer un échange ───────────────────────────────────────────────────
  readonly typeOptions = ITEM_TYPE_FILTER_OPTIONS;
  readonly subTypeOptions = ITEM_SUBTYPE_FILTER_OPTIONS;

  composing = signal(false);
  myItems = signal<UserItemInfo[]>([]);
  myItemsLoading = signal(false);
  selectedOfferedItem = signal<UserItemInfo | null>(null);
  offeredPez = 0;

  /**
   * Type filtré côté serveur (InventoryService.listItems le supporte déjà,
   * relance loadMyItems) — recherche texte + sous-type filtrés côté client
   * sur la page déjà chargée. Méthode plate, pas un computed() : ces deux
   * champs sont liés en ngModel (mutation directe, pas des signaux), un
   * computed() ne se re-déclencherait jamais dessus.
   */
  myItemsSearch = '';
  myItemsType: ItemType | '' = '';
  myItemsSubType: ItemSubType | '' = '';
  filteredMyItems(): UserItemInfo[] {
    const search = this.myItemsSearch.trim().toLowerCase();
    const subType = this.myItemsSubType;
    return this.myItems().filter(it =>
      (!search || it.item.name.toLowerCase().includes(search)) &&
      (!subType || it.item.subType === subType));
  }

  catalogSearch = '';
  catalogType: ItemType | '' = '';
  catalogSubType: ItemSubType | '' = '';
  catalogResults = signal<ItemInfo[]>([]);
  catalogLoading = signal(false);
  selectedRequestedItem = signal<ItemInfo | null>(null);
  requestedPez = 0;

  proposing = signal(false);
  proposeError = signal<string | null>(null);

  ngOnInit(): void {
    const p = this.dialogStack.open(this.dialogId, 70, 'center', 460, 560);
    this.zIndex.set(p.zIndex);
    this.pos.set({ top: p.top, left: p.left });
    this.loadMarket(false);
  }

  ngOnDestroy(): void {
    this.dialogStack.release(this.dialogId);
  }

  onDragStarted(): void {
    this.zIndex.set(this.dialogStack.bringToFront());
  }

  close(): void {
    this.tradeService.closePanel();
  }

  selectTab(tab: TradeTab): void {
    this.activeTab.set(tab);
    this.actionError.set(null);
    if (tab === 'mine' && this.mine().length === 0) this.loadMine();
    if (tab === 'history' && this.history().length === 0) this.loadHistory();
  }

  // ── Marché ────────────────────────────────────────────────────────────────

  applyMarketFilters(): void {
    this.marketPage.set(0);
    this.loadMarket(false);
  }

  onMarketScroll(event: Event): void {
    if (this.marketLoading() || this.marketPage() >= this.marketTotalPages() - 1) return;
    const el = event.target as HTMLElement;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < 60) {
      this.marketPage.update(p => p + 1);
      this.loadMarket(true);
    }
  }

  private loadMarket(append: boolean): void {
    this.marketLoading.set(true);
    this.tradeService.listMarket(this.marketSearch || undefined, this.marketItemType || undefined, this.marketSort, this.marketPage())
      .pipe(finalize(() => this.marketLoading.set(false)))
      .subscribe({
        next: page => {
          this.marketResults.update(list => append ? [...list, ...page.content] : page.content);
          this.marketTotalPages.set(page.totalPages);
        },
        error: () => { if (!append) this.marketResults.set([]); },
      });
  }

  acceptTrade(trade: TradeOffer): void {
    this.actionBusyId.set(trade.id);
    this.actionError.set(null);
    this.tradeService.accept(trade.id).subscribe({
      next: () => {
        this.actionBusyId.set(null);
        this.marketResults.update(list => list.filter(t => t.id !== trade.id));
        this.auth.refreshUser();
      },
      error: (err) => {
        this.actionBusyId.set(null);
        this.actionError.set(err?.error?.message ?? "Échec de l'échange.");
      },
    });
  }

  // ── Mes propositions ─────────────────────────────────────────────────────

  private loadMine(): void {
    this.mineLoading.set(true);
    this.tradeService.listMine().pipe(finalize(() => this.mineLoading.set(false))).subscribe({
      next: list => this.mine.set(list),
      error: () => this.mine.set([]),
    });
  }

  cancelTrade(trade: TradeOffer): void {
    this.actionBusyId.set(trade.id);
    this.tradeService.cancel(trade.id).subscribe({
      next: () => {
        this.actionBusyId.set(null);
        this.mine.update(list => list.filter(t => t.id !== trade.id));
        this.auth.refreshUser();
      },
      error: () => this.actionBusyId.set(null),
    });
  }

  // ── Historique ────────────────────────────────────────────────────────────

  private loadHistory(): void {
    this.historyLoading.set(true);
    this.tradeService.listHistory().pipe(finalize(() => this.historyLoading.set(false))).subscribe({
      next: list => this.history.set(list),
      error: () => this.history.set([]),
    });
  }

  historyOutcome(trade: TradeOffer): string {
    if (trade.status === 'CANCELLED') return 'Annulé';
    const myId = this.auth.user()?.id;
    return trade.offererId === myId
      ? `Échangé avec ${trade.acceptedByUsername}`
      : `Échangé avec ${trade.offererUsername}`;
  }

  // ── Proposer ──────────────────────────────────────────────────────────────

  openCompose(): void {
    this.composing.set(true);
    this.proposeError.set(null);
    this.selectedOfferedItem.set(null);
    this.selectedRequestedItem.set(null);
    this.offeredPez = 0;
    this.requestedPez = 0;
    this.myItemsSearch = '';
    this.myItemsType = '';
    this.myItemsSubType = '';
    this.catalogSearch = '';
    this.catalogType = '';
    this.catalogSubType = '';
    this.catalogResults.set([]);
    this.loadMyItems();
  }

  closeCompose(): void {
    this.composing.set(false);
  }

  /** Le type est le seul filtre qui redemande une page serveur — texte/sous-type restent client (voir filteredMyItems). */
  onMyItemsTypeChange(): void {
    this.loadMyItems();
  }

  private loadMyItems(): void {
    this.myItemsLoading.set(true);
    this.inventoryService.listItems(this.myItemsType || undefined, 0).pipe(finalize(() => this.myItemsLoading.set(false))).subscribe({
      next: page => this.myItems.set(page.content),
      error: () => this.myItems.set([]),
    });
  }

  pickMyItem(item: UserItemInfo): void {
    this.selectedOfferedItem.set(item);
  }

  searchCatalog(): void {
    this.catalogLoading.set(true);
    this.tradeService.searchItemCatalog(this.catalogSearch || undefined, this.catalogType || undefined, this.catalogSubType || undefined)
      .pipe(finalize(() => this.catalogLoading.set(false)))
      .subscribe({
        next: page => this.catalogResults.set(page.content),
        error: () => this.catalogResults.set([]),
      });
  }

  pickRequestedItem(item: ItemInfo): void {
    this.selectedRequestedItem.set(item);
  }

  submitPropose(): void {
    const offered = this.selectedOfferedItem();
    const requested = this.selectedRequestedItem();
    if (!offered?.id || !requested) return;

    this.proposing.set(true);
    this.proposeError.set(null);
    this.tradeService.propose({
      offeredUserItemId: offered.id,
      offeredPez: this.offeredPez || 0,
      requestedItemId: requested.id,
      requestedPez: this.requestedPez || 0,
    }).subscribe({
      next: () => {
        this.proposing.set(false);
        this.composing.set(false);
        this.auth.refreshUser();
        this.loadMine();
        this.activeTab.set('mine');
      },
      error: (err) => {
        this.proposing.set(false);
        this.proposeError.set(err?.error?.message ?? "Échec de la proposition.");
      },
    });
  }
}
