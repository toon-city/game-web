import { Component, EventEmitter, Input, Output, inject, computed } from '@angular/core';
import { RoomPermission } from '@toon-live/game-types';
import { SocketService } from '../../../core/services/socket.service';
import { FurniturePreviewTarget } from '../../../core/services/furniture-preview.service';

/**
 * Opened by clicking a placed furniture piece outside edit mode (GameCore
 * 'furniture:click', see GameCanvasComponent) — small bottom-right panel,
 * item preview + a "Prendre" action gated the same way as room moderation
 * (owner or admin, RoomAccessService.canManageRoom server-side; "prendre"
 * just reuses the existing furniture/remove action, already permission-
 * checked there — this button is convenience only, not the real boundary).
 */
@Component({
  selector: 'app-furniture-preview',
  standalone: true,
  templateUrl: './furniture-preview.component.html',
  styleUrls: ['./furniture-preview.component.scss'],
})
export class FurniturePreviewComponent {
  @Input({ required: true }) target!: FurniturePreviewTarget;
  @Input({ required: true }) roomId!: string;
  @Output() close = new EventEmitter<void>();

  private readonly socket = inject(SocketService);

  /** Room owner or admin — same rule enforced server-side (RoomAccessService). */
  readonly canTake = computed(() => {
    const state = this.socket.roomState();
    return !!state && state.yourPermission >= RoomPermission.OWN;
  });

  take(): void {
    this.socket.sendFurnitureRemove(this.roomId, { instanceId: String(this.target.instanceId) });
    this.close.emit();
  }
}
