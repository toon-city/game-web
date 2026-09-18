import { Component, EventEmitter, OnInit, OnDestroy, Output, inject, signal, input } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { NgClass } from '@angular/common';
import { finalize } from 'rxjs/operators';
import { ShopItemInfo, ShopIdType, CollectionInfo, ItemSubType } from '@toon-live/game-types';
import { ShopService } from '../../../core/services/shop.service';
import { AuthService } from '../../../core/services/auth.service';
import { DialogStackService } from '../../../core/services/dialog-stack.service';
import { ViewportService } from '../../../core/services/viewport.service';
import { InventoryService } from '../../../core/services/inventory.service';

type BuyState = { shopItemId: number; option: 'PEZ' | 'KREDS' } | null;
type ConfirmState = { item: ShopItemInfo; option: 'PEZ' | 'KREDS'; sourceEl: HTMLElement; quantity: number } | null;

/** Sane UI cap for unlimited-stock items — nobody's buying 500 benches in
 *  one click, and it keeps the request payload (one UserItem/PurchaseLog
 *  row per unit, server-side) bounded. */
const MAX_QTY_UNLIMITED = 99;

type ShopTab = { id: ShopIdType; label: string };

const SHOP_TABS: ShopTab[] = [
  { id: 'COUPE_TIFF',  label: 'Coupe-tiff' },
  { id: 'IKEBO',       label: 'Ikebo' },
  { id: 'VESTIS',      label: 'Vestis' },
  { id: 'BIJOUTERIE',  label: 'Bijouterie' },
];

type SubTypeTab = { id: ItemSubType; label: string };

/** Sub-category filters per shop -- only shops whose catalogue actually spans
 *  more than one ItemSubType get this row at all (COUPE_TIFF is HAIRSTYLE-only,
 *  BIJOUTERIE is a single catalogue too), see selectShop()/subTypeTabs(). */
const SUB_TYPE_TABS: Partial<Record<ShopIdType, SubTypeTab[]>> = {
  VESTIS: [
    { id: 'TOP',    label: 'T-shirts' },
    { id: 'BOTTOM', label: 'Pantalons' },
    { id: 'HAT',    label: 'Chapeaux' },
  ],
  IKEBO: [
    { id: 'PIECE',     label: 'Meubles' },
    { id: 'FLOOR',     label: 'Sols' },
    { id: 'WALL',      label: 'Murs' },
    { id: 'WALLPAPER', label: 'Papiers peints' },
  ],
};

@Component({
  selector: 'app-shop',
  standalone: true,
  imports: [DragDropModule, NgClass],
  templateUrl: './shop.component.html',
  styleUrls: ['./shop.component.scss'],
})
export class ShopComponent implements OnInit, OnDestroy {
  @Output() close = new EventEmitter<void>();

  private readonly shopService = inject(ShopService);
  private readonly inventoryService = inject(InventoryService);
  readonly auth = inject(AuthService);
  private readonly dialogStack = inject(DialogStackService);
  protected readonly viewport = inject(ViewportService);
  private readonly dialogId = this.dialogStack.newInstanceId();

  /** Bumped on open and on every drag — "dernier affiché + dernier déplacé". */
  zIndex = signal(100);
  /** On-open position — see DialogStackService.open() for why this isn't a
   *  fixed value in the SCSS anymore. */
  pos = signal({ top: 80, left: 16 });

  readonly shopTabs = SHOP_TABS;

  activeShop        = signal<ShopIdType>('COUPE_TIFF');
  collections       = signal<CollectionInfo[]>([]);
  activeCollection  = signal<number | null>(null);
  activeSubType     = signal<ItemSubType | null>(null);
  items             = signal<ShopItemInfo[]>([]);
  loading           = signal(false);
  page              = signal(0);
  totalPages        = signal(0);
  buyError          = signal<string | null>(null);
  buying            = signal<BuyState>(null);
  confirming        = signal<ConfirmState>(null);

  ngOnInit(): void {
    const p = this.dialogStack.open(this.dialogId, 80, 16, 700, 480);
    this.zIndex.set(p.zIndex);
    this.pos.set({ top: p.top, left: p.left });
    this.loadCollections();
  }

  ngOnDestroy(): void {
    this.dialogStack.release(this.dialogId);
  }

  onDragStarted(): void {
    this.zIndex.set(this.dialogStack.bringToFront());
  }

  selectShop(shopId: ShopIdType): void {
    this.activeShop.set(shopId);
    this.activeCollection.set(null);
    this.activeSubType.set(null);
    this.page.set(0);
    this.loadCollections();
  }

  selectCollection(collectionId: number | null): void {
    this.activeCollection.set(collectionId);
    this.page.set(0);
    this.load();
  }

  /** Undefined (not just empty) when the current shop has no sub-category
   *  split at all -- lets the template hide the row entirely with `@if`
   *  instead of showing a pointless single "Tous" button. */
  subTypeTabs(): SubTypeTab[] | undefined {
    return SUB_TYPE_TABS[this.activeShop()];
  }

  selectSubType(subType: ItemSubType | null): void {
    this.activeSubType.set(subType);
    this.page.set(0);
    this.load();
  }

  prevPage(): void {
    if (this.page() > 0) { this.page.update(p => p - 1); this.load(); }
  }

  nextPage(): void {
    if (this.page() < this.totalPages() - 1) { this.page.update(p => p + 1); this.load(); }
  }

  /** Buy button click — asks for confirmation first, doesn't purchase yet.
   *  Captures the clicked card's image element now (for the fly-to-inventory
   *  effect on confirm) since it's still trivially reachable from the event,
   *  rather than re-querying the DOM after the dialog closes. */
  buy(item: ShopItemInfo, option: 'PEZ' | 'KREDS', event: MouseEvent): void {
    if (this.buying()) return;
    const card = (event.currentTarget as HTMLElement).closest('.item');
    const img = card?.querySelector<HTMLElement>('.item-image img');
    if (!img) return;
    this.buyError.set(null);
    this.confirming.set({ item, option, sourceEl: img, quantity: 1 });
  }

  cancelBuy(): void {
    this.confirming.set(null);
  }

  /** null stock = unlimited, capped at MAX_QTY_UNLIMITED for the UI; a
   *  limited stock caps the quantity picker exactly there — can't ask for
   *  more than what's actually available. */
  maxQty(item: ShopItemInfo): number {
    return item.stock === null ? MAX_QTY_UNLIMITED : item.stock;
  }

  /** Item without `possessable` can't stack (equipping N hairstyles makes
   *  no sense) — same rule the backend clamps to, just surfaced in the UI
   *  instead of silently discarding whatever quantity was picked. */
  canPickQuantity(item: ShopItemInfo): boolean {
    return item.item.possessable && this.maxQty(item) > 1;
  }

  adjustQty(delta: number): void {
    this.confirming.update(c => {
      if (!c) return c;
      const max = this.maxQty(c.item);
      const q = Math.min(max, Math.max(1, c.quantity + delta));
      return { ...c, quantity: q };
    });
  }

  setQty(raw: number): void {
    this.confirming.update(c => {
      if (!c) return c;
      const max = this.maxQty(c.item);
      const q = Math.min(max, Math.max(1, Math.round(raw) || 1));
      return { ...c, quantity: q };
    });
  }

  confirmTotal(c: NonNullable<ConfirmState>): number {
    return (c.option === 'PEZ' ? c.item.pezPrice! : c.item.kredPrice!) * c.quantity;
  }

  /** kredBonus only ever applies to the PEZ option (see the buy buttons'
   *  own "+X kred" — KREDS purchases have no separate bonus, you're already
   *  paying in kreds). Missing from the confirm dialog entirely before. */
  confirmBonus(c: NonNullable<ConfirmState>): number {
    return c.option === 'PEZ' ? c.item.kredBonus * c.quantity : 0;
  }

  confirmBuy(): void {
    const c = this.confirming();
    if (!c || this.buying()) return;
    this.confirming.set(null);
    this.buyError.set(null);
    this.buying.set({ shopItemId: c.item.id, option: c.option });

    this.shopService.buy(this.activeShop(), c.item.id, c.option, c.quantity)
      .pipe(finalize(() => this.buying.set(null)))
      .subscribe({
        next: () => {
          this.flyToInventory(c.sourceEl);
          this.auth.refreshUser();
          this.load();
          // The inventory panel, if already open, doesn't otherwise hear
          // about this — same "server-side content change with no
          // equip/unequip" case its own itemsChanged$ doc describes for
          // furniture placement/pickup, just via a purchase instead.
          this.inventoryService.itemsChanged$.next();
        },
        error: (err) => {
          this.buyError.set(err?.error?.message ?? 'Achat échoué. Veuillez réessayer.');
        },
      });
  }

  /** Clones the bought item's image, flies it from the shop card to the
   *  navbar's inventory icon, then discards it — purely visual, the real
   *  inventory update already happened via load()/refreshUser(). */
  private flyToInventory(sourceEl: HTMLElement): void {
    const target = document.getElementById('nav-inventory-icon');
    if (!target) return;

    const srcRect = sourceEl.getBoundingClientRect();
    const tgtRect = target.getBoundingClientRect();

    const clone = sourceEl.cloneNode(true) as HTMLElement;
    clone.style.position = 'fixed';
    clone.style.left = `${srcRect.left}px`;
    clone.style.top = `${srcRect.top}px`;
    clone.style.width = `${srcRect.width}px`;
    clone.style.height = `${srcRect.height}px`;
    clone.style.margin = '0';
    clone.style.zIndex = '9999';
    clone.style.pointerEvents = 'none';
    clone.style.borderRadius = '8px';
    clone.style.transition = 'transform 0.55s cubic-bezier(0.55, 0, 0.85, 0.35), opacity 0.55s ease-in';
    clone.style.willChange = 'transform, opacity';
    document.body.appendChild(clone);

    const dx = (tgtRect.left + tgtRect.width / 2) - (srcRect.left + srcRect.width / 2);
    const dy = (tgtRect.top + tgtRect.height / 2) - (srcRect.top + srcRect.height / 2);

    // Force layout before transitioning, otherwise the browser can coalesce
    // the initial position + the transform into one paint and skip the
    // animation entirely.
    void clone.getBoundingClientRect();

    requestAnimationFrame(() => {
      clone.style.transform = `translate(${dx}px, ${dy}px) scale(0.1)`;
      clone.style.opacity = '0.15';
    });

    clone.addEventListener('transitionend', () => clone.remove(), { once: true });
    // Safety net in case transitionend never fires (e.g. tab backgrounded).
    setTimeout(() => clone.remove(), 900);
  }

  canBuyPez(item: ShopItemInfo): boolean {
    return item.pezPrice != null && (item.stock === null || item.stock > 0);
  }

  canBuyKreds(item: ShopItemInfo): boolean {
    return item.kredPrice != null && (item.stock === null || item.stock > 0);
  }

  isOutOfStock(item: ShopItemInfo): boolean {
    return item.stock !== null && item.stock <= 0;
  }

  private loadCollections(): void {
    this.shopService.listCollections(this.activeShop()).subscribe({
      next: cols => {
        this.collections.set(cols);
        this.load();
      },
      error: () => {
        this.collections.set([]);
        this.load();
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.shopService.listItems(this.activeShop(), this.activeCollection() ?? undefined, this.page(), this.activeSubType() ?? undefined)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: page => {
          this.items.set(page.content);
          this.totalPages.set(page.totalPages);
        },
        error: () => this.items.set([]),
      });
  }
}
