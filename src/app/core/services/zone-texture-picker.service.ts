import { Injectable, signal } from '@angular/core';
import { ZoneType } from '@toon-live/game-types';

export interface ZoneTexturePickerTarget {
  zoneType: ZoneType;
  zoneIndex: number;
}

/**
 * Cross-component trigger for the wallpaper/floor picker panel — same
 * reasoning as FurniturePreviewService: opened from deep inside
 * GameCanvasComponent (a GameCore 'zone:click' event, zone-edit mode on),
 * rendered once at the app root.
 */
@Injectable({ providedIn: 'root' })
export class ZoneTexturePickerService {
  readonly target = signal<ZoneTexturePickerTarget | null>(null);

  open(target: ZoneTexturePickerTarget): void {
    this.target.set(target);
  }

  close(): void {
    this.target.set(null);
  }
}
