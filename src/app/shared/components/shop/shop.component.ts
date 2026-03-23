import { Component, EventEmitter, OnInit, Output, inject, signal, input } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { NgClass } from '@angular/common';
import { finalize } from 'rxjs/operators';
import { ShopItemInfo, ShopIdType, CollectionInfo } from '@toon-live/game-types';
import { ShopService } from '../../../core/services/shop.service';
import { AuthService } from '../../../core/services/auth.service';

type BuyState = { shopItemId: number; option: 'PEZ' | 'KREDS' } | null;

type ShopTab = { id: ShopIdType; label: string };

const SHOP_TABS: ShopTab[] = [
  { id: 'COUPE_TIFF', label: 'Coupe-tiff' },
  { id: 'IKEBO',      label: 'Ikebo' },
  { id: 'VESTIS',     label: 'Vestis' },
];

@Component({
  selector: 'app-shop',
  standalone: true,
  imports: [DragDropModule, NgClass],
  templateUrl: './shop.component.html',
  styleUrls: ['./shop.component.scss'],
})
export class ShopComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  private readonly shopService = inject(ShopService);
  readonly auth = inject(AuthService);

  readonly shopTabs = SHOP_TABS;

  activeShop        = signal<ShopIdType>('COUPE_TIFF');
  collections       = signal<CollectionInfo[]>([]);
  activeCollection  = signal<number | null>(null);
  items             = signal<ShopItemInfo[]>([]);
  loading           = signal(false);
  page              = signal(0);
  totalPages        = signal(0);
  buyError          = signal<string | null>(null);
  buying            = signal<BuyState>(null);

  ngOnInit(): void {
    this.loadCollections();
  }

  selectShop(shopId: ShopIdType): void {
    this.activeShop.set(shopId);
    this.activeCollection.set(null);
    this.page.set(0);
    this.loadCollections();
  }

  selectCollection(collectionId: number | null): void {
    this.activeCollection.set(collectionId);
    this.page.set(0);
    this.load();
  }

  prevPage(): void {
    if (this.page() > 0) { this.page.update(p => p - 1); this.load(); }
  }

  nextPage(): void {
    if (this.page() < this.totalPages() - 1) { this.page.update(p => p + 1); this.load(); }
  }

  buy(item: ShopItemInfo, option: 'PEZ' | 'KREDS'): void {
    if (this.buying()) return;
    this.buyError.set(null);
    this.buying.set({ shopItemId: item.id, option });

    this.shopService.buy(this.activeShop(), item.id, option)
      .pipe(finalize(() => this.buying.set(null)))
      .subscribe({
        next: () => {
          this.auth.refreshUser();
          this.load();
        },
        error: (err) => {
          this.buyError.set(err?.error?.message ?? 'Achat échoué. Veuillez réessayer.');
        },
      });
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
    this.shopService.listItems(this.activeShop(), this.activeCollection() ?? undefined, this.page())
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
