import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, Input, inject } from '@angular/core';
import { Application } from 'pixi.js';
import { Avatar, BaseTextureLoader, AssetBaseUrl } from '@toon-live/game-avatar';
import { AuthService } from '../../../core/services/auth.service';
import { InventoryService } from '../../../core/services/inventory.service';
import { environment } from '../../../../environments/environment';

const BOX = 68; // matches .ic-avatar's fixed size (identity-card.component.scss)
const AVATAR_W = 80;
const AVATAR_H = 120;

/**
 * Small live badge: the current user's real avatar (front-facing, with
 * socle) — hair/hat/tshirt/etc. as actually equipped, not a static picture.
 * Used in the identity card HUD in place of the old assets/images/avatar.png
 * placeholder.
 *
 * Own Application + Avatar, no GameCore needed (same reasoning as
 * game-admin's clothing-studio AvatarPreviewComponent: a badge doesn't need
 * house/camera/input, just one avatar sitting in a tiny stage).
 */
@Component({
  selector: 'app-avatar-badge',
  standalone: true,
  template: `<canvas #canvas class="avatar-badge-canvas"></canvas>`,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    .avatar-badge-canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
  `],
})
export class AvatarBadgeComponent implements AfterViewInit, OnDestroy {
  /**
   * When set, renders THIS avatar instead of "the current user, live-equipped".
   * Used by UserActionDialogComponent to preview another player from the
   * data already in RoomUser — no extra network call, and no subscription
   * to equippedChanged$ (that only makes sense for your own outfit).
   */
  @Input() override?: { skinColor: number; clothing: Record<string, string> };

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly auth = inject(AuthService);
  private readonly inventory = inject(InventoryService);

  private app: Application | null = null;
  private avatar: Avatar | null = null;
  private equippedSub?: { unsubscribe(): void };

  async ngAfterViewInit(): Promise<void> {
    this.app = new Application();
    await this.app.init({
      canvas: this.canvasRef.nativeElement,
      width: BOX,
      height: BOX,
      backgroundAlpha: 0,
      antialias: false,
      resolution: window.devicePixelRatio ?? 1,
      autoDensity: true,
    });

    if (environment.assetsUrl) AssetBaseUrl.setDynamic(environment.assetsUrl);
    await BaseTextureLoader.getInstance().load();

    // direction 1 = down/front-facing — the pose that shows the face (see
    // the direction diagram at the top of game-core's Avatar.ts).
    this.avatar = new Avatar(this.app, { showSocle: true, direction: 1 });

    // Fit the 80x120 avatar (+socle, already within that box) into the
    // square badge without cropping — "contain", not "cover", so the socle
    // at the feet stays visible.
    const zoom = Math.min(BOX / AVATAR_W, BOX / AVATAR_H);
    this.avatar.scale.set(zoom);
    this.avatar.x = (BOX - AVATAR_W * zoom) / 2;
    this.avatar.y = (BOX - AVATAR_H * zoom) / 2;

    this.app.stage.addChild(this.avatar);

    if (this.override) {
      this.avatar.setSkinColor(this.override.skinColor);
      for (const [category, id] of Object.entries(this.override.clothing)) {
        this.avatar.changeClothing(category, id);
      }
      return;
    }

    const skinColor = this.auth.user()?.skinColor;
    if (skinColor !== undefined) this.avatar.setSkinColor(skinColor);

    this.refreshClothing();
    this.equippedSub = this.inventory.equippedChanged$.subscribe(() => this.refreshClothing());
  }

  private refreshClothing(): void {
    this.inventory.getEquipped().subscribe({
      next: (clothing) => {
        if (!this.avatar) return;
        for (const [category, id] of Object.entries(clothing)) {
          this.avatar.changeClothing(category, id);
        }
      },
      error: () => { /* badge just stays undressed/bare — not worth surfacing to the user */ },
    });
  }

  ngOnDestroy(): void {
    this.equippedSub?.unsubscribe();
    this.app?.ticker.stop();
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.avatar = null;
  }
}
