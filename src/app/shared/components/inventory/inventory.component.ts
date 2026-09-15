import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { NgClass } from '@angular/common';
import { finalize } from 'rxjs/operators';
import { UserItemInfo, ItemType } from '@toon-live/game-types';
import { InventoryService } from '../../../core/services/inventory.service';
import { DialogStackService } from '../../../core/services/dialog-stack.service';

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
  private readonly dialogStack = inject(DialogStackService);

  /** Bumped on open and on every drag — "dernier affiché + dernier déplacé". */
  zIndex = signal(100);

  filter = signal<InvFilter>('TOUS');
  readonly filters: InvFilter[] = ['TOUS', 'MEUBLES', 'VETEMENTS', 'DIVERS'];

  items = signal<UserItemInfo[]>([]);
  loading = signal(false);
  totalPages = signal(0);
  page = signal(0);

  /** Item shown in the preview area — click selects, it no longer acts immediately. */
  selected = signal<UserItemInfo | null>(null);

  ngOnInit(): void {
    this.zIndex.set(this.dialogStack.bringToFront());
    this.load(false);
  }

  onDragStarted(): void {
    this.zIndex.set(this.dialogStack.bringToFront());
  }

  setFilter(f: InvFilter): void {
    this.filter.set(f);
    this.page.set(0);
    this.load(false);
  }

  /** Bound to .items' (scroll) — infinite scroll instead of prev/next
   *  buttons: load and append the next page once within one row's height
   *  of the bottom. */
  onItemsScroll(event: Event): void {
    if (this.loading() || this.page() >= this.totalPages() - 1) return;
    const el = event.target as HTMLElement;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < 60) {
      this.page.update(p => p + 1);
      this.load(true);
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
    if (!item.id || !item.equipped || this.isAlwaysWorn(item)) return;
    this.inventoryService.unequip(item.id).subscribe({
      next: updated => {
        this.items.update(list => list.map(i => i.id === updated.id ? updated : i));
        if (this.selected()?.id === updated.id) this.selected.set(updated);
      },
    });
  }

  /** TOP/BOTTOM can't be taken off bare — only swapped for another one
   *  (equip() already unequips the old one automatically). Server-enforced
   *  (InventoryService.unequipItem); this just keeps the button from
   *  offering an action that would 400. */
  isAlwaysWorn(item: UserItemInfo): boolean {
    return item.item.subType === 'TOP' || item.item.subType === 'BOTTOM';
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

    // Left alone, the native drag image is a snapshot of the whole tile
    // (white card, shadow, rounded corners) — swap it for just the item's
    // own sprite, bigger, so it reads as "holding the actual piece" instead
    // of dragging a UI chip around. A throwaway <img>, positioned off-
    // screen so it still paints for setDragImage to snapshot, removed right
    // after — same technique as any custom-drag-image workaround.
    if (item.item.displayImage && event.dataTransfer) {
      const ghost = new Image();
      ghost.src = item.item.displayImage;
      ghost.style.width = '64px';
      ghost.style.height = '64px';
      ghost.style.position = 'fixed';
      ghost.style.top = '-1000px';
      document.body.appendChild(ghost);
      event.dataTransfer.setDragImage(ghost, 32, 32);
      setTimeout(() => ghost.remove(), 0);
    }
  }

  onDragEnd(): void {
    // Defensive only — GameCanvasComponent.onDrop already clears this on a
    // successful drop; covers a drag released outside any valid target.
    this.inventoryService.dragPayload = null;
  }

  private load(append: boolean): void {
    this.loading.set(true);
    const typeFilter = FILTER_MAP[this.filter()];
    this.inventoryService.listItems(typeFilter, this.page())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: page => {
          this.items.update(list => append ? [...list, ...page.content] : page.content);
          this.totalPages.set(page.totalPages);
        },
        error: () => { if (!append) this.items.set([]); },
      });
  }
}
