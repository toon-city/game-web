import { Component, EventEmitter, Input, Output, inject, computed } from '@angular/core';
import { RoomPermission } from '@toon-live/game-types';
import { SocketService } from '../../../core/services/socket.service';
import { FurniturePreviewService, FurniturePreviewTarget } from '../../../core/services/furniture-preview.service';

/**
 * Opened by clicking (outside edit mode) or placing/moving/rotating/clicking
 * (in edit mode) a furniture piece — GameCore's 'furniture:click', see
 * GameCanvasComponent. Small bottom-right panel: item preview, a rotate
 * button (was right-click-only), and a "Prendre" action — both gated the
 * same way as room moderation (owner or admin, RoomAccessService.
 * canManageRoom server-side; these buttons are convenience only, the real
 * boundary is still enforced on furniture/rotate and furniture/remove).
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
  private readonly furniturePreview = inject(FurniturePreviewService);

  /** Room owner or admin — same rule enforced server-side (RoomAccessService). */
  readonly canManage = computed(() => {
    const state = this.socket.roomState();
    return !!state && state.yourPermission >= RoomPermission.OWN;
  });

  rotate(): void {
    // Same 4-step cycle as the right-click handler (FurnitureView.onRightClick).
    // Goes through GameCore (FurniturePreviewService.onRotateRequest), not a
    // direct sendFurnitureRotate: rotating needs a real collision check
    // against the piece's actual footprint in the new orientation
    // (FurnitureController.rotateFurniture), which only the live Pixi scene
    // can do — this component has no way to validate it itself. The network
    // send happens after, only on success (GameCanvasComponent's
    // 'furniture:rotated' listener), not here.
    const next = (this.target.orientation % 4) + 1;
    this.furniturePreview.requestRotate(this.target.instanceId, next);
  }

  take(): void {
    this.socket.sendFurnitureRemove(this.roomId, { instanceId: String(this.target.instanceId) });
    this.close.emit();
  }
}
