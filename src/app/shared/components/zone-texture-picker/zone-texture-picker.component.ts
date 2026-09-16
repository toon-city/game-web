import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, inject, signal, computed } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';
import { UserItemInfo, ItemSubType } from '@toon-live/game-types';
import { InventoryService } from '../../../core/services/inventory.service';
import { SocketService } from '../../../core/services/socket.service';
import { DialogStackService } from '../../../core/services/dialog-stack.service';
import { ZoneTexturePickerTarget } from '../../../core/services/zone-texture-picker.service';

/**
 * Opened by clicking a wall or floor while zone-edit mode is on (GameCore's
 * 'zone:click', see GameCanvasComponent) — same "cross-component trigger,
 * mounted once at app root" pattern as FurniturePreviewComponent/
 * UserActionDialogComponent. Lists the player's own WALLPAPER/FLOOR items
 * (whichever matches the clicked zone) to apply, and — if the zone already
 * has one — a "Retirer" action. Both go straight through the server
 * (TextureStateService); no optimistic local apply, same reasoning as
 * furniture placement: the broadcast echo is what actually updates the room
 * for everyone, including the player who clicked.
 */
@Component({
  selector: 'app-zone-texture-picker',
  standalone: true,
  imports: [DragDropModule],
  templateUrl: './zone-texture-picker.component.html',
  styleUrls: ['./zone-texture-picker.component.scss'],
})
export class ZoneTexturePickerComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) target!: ZoneTexturePickerTarget;
  @Input({ required: true }) roomId!: string;
  @Output() close = new EventEmitter<void>();

  private readonly inventoryService = inject(InventoryService);
  private readonly socket = inject(SocketService);
  private readonly dialogStack = inject(DialogStackService);
  private readonly dialogId = this.dialogStack.newInstanceId();

  zIndex = signal(100);
  /** On-open position — see DialogStackService.open() for why this isn't a
   *  fixed value in the SCSS anymore. */
  pos = signal({ top: 80, left: 16 });
  items = signal<UserItemInfo[]>([]);
  loading = signal(false);
  /** Set on a TEXTURE_ACTION_FAILED reply to *my own* request — see roomError$ below. */
  error = signal<string | null>(null);

  private itemsSub?: Subscription;
  private errorSub?: Subscription;

  readonly title = computed(() => this.target.zoneType === 'WALL' ? 'Papier peint' : 'Revêtement de sol');

  /** Whatever currently covers the clicked zone, if anything — read live off
   *  the room snapshot rather than fetched separately, same source
   *  furniture's own preview panel uses. */
  readonly current = computed(() => {
    const textures = this.socket.roomState()?.textures ?? [];
    return textures.find(t => t.zoneType === this.target.zoneType && t.zoneIndex === this.target.zoneIndex) ?? null;
  });

  ngOnInit(): void {
    const p = this.dialogStack.open(this.dialogId, 80, 16, 320, 440);
    this.zIndex.set(p.zIndex);
    this.pos.set({ top: p.top, left: p.left });
    this.load();
    // The panel stays open across an apply/remove (see GameCanvasComponent's
    // textureApply$/textureRemove$ handlers, which also fire itemsChanged$) —
    // without this the item just applied would still show as pickable.
    this.itemsSub = this.inventoryService.itemsChanged$.subscribe(() => this.load());
    this.errorSub = this.socket.roomError$.subscribe((e) => {
      if (e.code !== 'TEXTURE_ACTION_FAILED') return;
      this.error.set(e.message);
    });
  }

  onDragStarted(): void {
    this.zIndex.set(this.dialogStack.bringToFront());
  }

  ngOnChanges(): void {
    // Re-opened on a different zone (clicked another wall/floor while the
    // panel was already up) — target is a new object each time
    // (ZoneTexturePickerService.open), so this fires on every zone switch.
    this.error.set(null);
    this.load();
  }

  ngOnDestroy(): void {
    this.itemsSub?.unsubscribe();
    this.errorSub?.unsubscribe();
    this.dialogStack.release(this.dialogId);
  }

  private load(): void {
    this.loading.set(true);
    const subType: ItemSubType = this.target.zoneType === 'WALL' ? 'WALLPAPER' : 'FLOOR';
    this.inventoryService.listItems(undefined, 0, subType).subscribe({
      next: (page) => { this.items.set(page.content); this.loading.set(false); },
      error: () => { this.items.set([]); this.loading.set(false); },
    });
  }

  apply(item: UserItemInfo): void {
    if (!item.id) return;
    this.error.set(null);
    this.socket.sendTextureApply(this.roomId, {
      userItemId: item.id,
      zoneType: this.target.zoneType,
      zoneIndex: this.target.zoneIndex,
    });
  }

  remove(): void {
    this.error.set(null);
    this.socket.sendTextureRemove(this.roomId, {
      zoneType: this.target.zoneType,
      zoneIndex: this.target.zoneIndex,
    });
  }
}
