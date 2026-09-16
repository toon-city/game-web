import { Injectable, signal } from '@angular/core';

export interface FurniturePreviewTarget {
  instanceId: number;
  name: string;
  displayImage: string | null;
  orientation: number;
}

/**
 * Cross-component trigger for the furniture preview panel — same reasoning
 * as UserActionDialogService: opened from deep inside GameCanvasComponent
 * (a GameCore 'furniture:click' event, edit mode off), rendered once at the
 * app root as a bottom-right panel.
 */
@Injectable({ providedIn: 'root' })
export class FurniturePreviewService {
  readonly target = signal<FurniturePreviewTarget | null>(null);

  /**
   * Set by GameCanvasComponent (same indirection as InventoryService.
   * onPlaceFurniture — this panel is a top-level overlay, not a child of the
   * canvas) to the room's live GameCore.rotateFurniture. Rotating needs the
   * actual Pixi scene (collision check against the piece's real footprint,
   * see FurnitureController.rotateFurniture) — this component has no other
   * way to reach it than through here, and no way to validate a rotation
   * itself.
   */
  onRotateRequest: ((instanceId: number, orientation: number) => void) | null = null;

  /** No-ops (the rotate button just does nothing) if the canvas isn't
   *  mounted — shouldn't happen in practice, this panel only exists while
   *  a room is open, but a stale target lingering half a tick into a room
   *  change is cheap to guard against. */
  requestRotate(instanceId: number, orientation: number): void {
    this.onRotateRequest?.(instanceId, orientation);
  }

  open(target: FurniturePreviewTarget): void {
    this.target.set(target);
  }

  close(): void {
    this.target.set(null);
  }

  /** A rotate can be broadcast by anyone with rights (not just whoever has
   *  the panel open) — keeps the shown orientation live either way. */
  updateOrientation(instanceId: number, orientation: number): void {
    this.target.update(t => (t && t.instanceId === instanceId) ? { ...t, orientation } : t);
  }
}
