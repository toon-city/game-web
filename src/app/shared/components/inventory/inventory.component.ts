import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { NgClass } from '@angular/common';
import { finalize } from 'rxjs/operators';
import { UserItemInfo, ItemType } from '@toon-live/game-types';
import { InventoryService } from '../../../core/services/inventory.service';

type InvFilter = 'TOUS' | 'MEUBLES' | 'VETEMENTS' | 'DIVERS';

const FILTER_MAP: Record<InvFilter, ItemType | undefined> = {
  TOUS: undefined,
  MEUBLES: 'FURNITURE',
  VETEMENTS: 'CLOTHING',
  DIVERS: 'MISC',
};

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [DragDropModule, NgClass],
  templateUrl: './inventory.component.html',
  styleUrls: ['./inventory.component.scss'],
})
export class InventoryComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  private readonly inventoryService = inject(InventoryService);

  filter = signal<InvFilter>('TOUS');
  readonly filters: InvFilter[] = ['TOUS', 'MEUBLES', 'VETEMENTS', 'DIVERS'];

  items = signal<UserItemInfo[]>([]);
  loading = signal(false);
  totalPages = signal(0);
  page = signal(0);

  /** Item shown in the preview area — click selects, it no longer acts immediately. */
  selected = signal<UserItemInfo | null>(null);

  ngOnInit(): void {
    this.load();
  }

  setFilter(f: InvFilter): void {
    this.filter.set(f);
    this.page.set(0);
    this.load();
  }

  prevPage(): void {
    if (this.page() > 0) {
      this.page.update(p => p - 1);
      this.load();
    }
  }

  nextPage(): void {
    if (this.page() < this.totalPages() - 1) {
      this.page.update(p => p + 1);
      this.load();
    }
  }

  equip(item: UserItemInfo): void {
    if (!item.id || item.equipped) return;
    this.inventoryService.equip(item.id).subscribe({
      next: updated => {
        this.items.update(list => list.map(i => i.id === updated.id ? updated : i));
        if (this.selected()?.id === updated.id) this.selected.set(updated);
      },
    });
  }

  unequip(item: UserItemInfo): void {
    if (!item.id || !item.equipped) return;
    this.inventoryService.unequip(item.id).subscribe({
      next: updated => {
        this.items.update(list => list.map(i => i.id === updated.id ? updated : i));
        if (this.selected()?.id === updated.id) this.selected.set(updated);
      },
    });
  }

  /**
   * Un meuble n'a pas d'état "équipé/pas équipé" binaire — il lui faut une
   * room + une position + une orientation. Place = fermer le panneau et
   * démarrer un placement dans la room (voir GameCanvasComponent.startPlacingFurniture,
   * qui bascule maintenant automatiquement en mode édition si nécessaire).
   */
  place(item: UserItemInfo): void {
    if (!item.id || item.placedInRoomId) return;
    this.inventoryService.startPlacing(item);
    this.close.emit();
  }

  /** Click selects for the preview area instead of acting immediately —
   *  the actual action (placer/porter/retirer) is a button there now. */
  select(item: UserItemInfo): void {
    this.selected.set(this.selected()?.id === item.id ? null : item);
  }

  /** Only a not-yet-placed furniture piece can be dragged toward the room. */
  canDrag(item: UserItemInfo): boolean {
    return item.item.itemType === 'FURNITURE' && !item.placedInRoomId;
  }

  onDragStart(event: DragEvent, item: UserItemInfo): void {
    if (!this.canDrag(item)) { event.preventDefault(); return; }
    // Firefox refuses a drag with no data set at all — the actual payload
    // handoff is InventoryService.dragPayload (cross-component, see there).
    event.dataTransfer?.setData('text/plain', 'furniture');
    this.inventoryService.dragPayload = item;
  }

  onDragEnd(): void {
    // Defensive only — GameCanvasComponent.onDrop already clears this on a
    // successful drop; covers a drag released outside any valid target.
    this.inventoryService.dragPayload = null;
  }

  private load(): void {
    this.loading.set(true);
    const typeFilter = FILTER_MAP[this.filter()];
    this.inventoryService.listItems(typeFilter, this.page())
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
