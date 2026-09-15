import { Injectable, signal } from '@angular/core';

export interface FurniturePreviewTarget {
  instanceId: number;
  name: string;
  displayImage: string | null;
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

  open(target: FurniturePreviewTarget): void {
    this.target.set(target);
  }

  close(): void {
    this.target.set(null);
  }
}
