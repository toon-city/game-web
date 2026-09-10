import { Injectable, signal } from '@angular/core';
import { RoomUser } from '@toon-live/game-types';

/**
 * Cross-component trigger for UserActionDialogComponent, rendered once at
 * the app root (same reason InventoryService.onPlaceFurniture exists: the
 * dialog is a top-level overlay, but it's opened from GameMenuComponent —
 * a sibling of app-root — AND from deep inside GameCanvasComponent via a
 * GameCore 'avatar:click' event, so a plain @Output up the tree can't reach
 * both callers uniformly).
 */
@Injectable({ providedIn: 'root' })
export class UserActionDialogService {
  readonly target = signal<RoomUser | null>(null);

  open(user: RoomUser): void {
    this.target.set(user);
  }

  close(): void {
    this.target.set(null);
  }
}
