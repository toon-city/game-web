import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, Input, inject } from '@angular/core';
import { Application, Graphics } from 'pixi.js';
import { Avatar, BaseTextureLoader, AssetBaseUrl } from '@toon-live/game-avatar';
import { AuthService } from '../../../core/services/auth.service';
import { InventoryService } from '../../../core/services/inventory.service';
import { environment } from '../../../../environments/environment';

const DEFAULT_BOX = 68; // matches .ic-avatar's fixed size (identity-card.component.scss)
const AVATAR_W = 80;
const AVATAR_H = 120;
/**
 * Headroom reserved above the avatar's nominal y=0, in avatar-local px —
 * 'full' mode used to fit AVATAR_W x AVATAR_H edge-to-edge with zero
 * margin, so any hat/hair frame whose spriteSourceSize.y is negative (its
 * art legitimately extends above the nominal canvas top — e.g.
 * chapeau_paques4's -7, a normal trimmed-asset thing, not a broken one)
 * got clipped by the canvas boundary itself, not just a CSS overflow.
 */
const HEAD_MARGIN = 16;

/**
 * Head bounding box within the 80x120 direction-1 (front-facing) frame —
 * measured from human_hd_1_0.png's trimmed bbox. Badges only ever render
 * direction 1, so this one crop rect is enough for 'head' mode.
 */
const HEAD_BBOX = { x: 17, y: 23, w: 41, h: 42 };
/**
 * Head fills this fraction of the box's largest dimension. Both 0.82 and a
 * later 0.5 were tried and still looked wrong live (reported: head looks
 * huge, spilling past the ring) despite an offline composite of the HEAD
 * ALONE looking correctly margined at either value — the composite was
 * misleading because it only rendered the head bbox crop, not what this
 * code actually did: position/scale the WHOLE avatar and let the CANVAS
 * EDGE do the cropping. The neck/shoulders sit immediately below the head
 * in the source art, same skin tone, and were bleeding into the space
 * below the chin — reading as "the head fills the whole circle" even
 * though the head itself was sized correctly. Fixed by actually masking to
 * the head's own bbox (see below) instead of relying on canvas-edge
 * clipping. 0.78 (mask == bbox exactly, so this was ALSO the margin) still
 * read as too big/off-center against the circular ring: the bbox is
 * 41x42, not square, so equal fill on both axes left unequal margins on
 * each side — barely noticeable as a rectangle, but obvious once a
 * constant-radius circle is cropping it. 0.62 leaves real breathing room
 * on every side.
 */
const HEAD_FILL = 0.62;

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
  template: `<canvas #canvas class="avatar-badge-canvas" [class.head-crop]="mode === 'head'"></canvas>`,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    .avatar-badge-canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
    .avatar-badge-canvas.head-crop { border-radius: 50%; }
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

  /** Canvas width in px (and height too, unless `height` is set) — defaults to the identity-card badge's 68px, bump it for a bigger avatar (e.g. the profile page). */
  @Input() size = DEFAULT_BOX;

  /**
   * Canvas height in px, when it should differ from `size` — e.g. a
   * non-square box matching the avatar's own 80:120 aspect ratio so 'full'
   * mode fills it edge-to-edge with no letterbox margin on either axis
   * (a square box always leaves one axis under-filled, which reads as the
   * avatar sitting off-center even though it's centered within its own
   * empty margin). Defaults to `size` (square), the original behaviour.
   */
  @Input() height?: number;

  /** 'full' = whole body + socle (contain-fit, the original behaviour). 'head' = zoomed/cropped to just the head, circular — for compact list rows (friends, requests, blacklist). */
  @Input() mode: 'full' | 'head' = 'full';

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly auth = inject(AuthService);
  private readonly inventory = inject(InventoryService);

  private app: Application | null = null;
  private avatar: Avatar | null = null;
  private equippedSub?: { unsubscribe(): void };

  async ngAfterViewInit(): Promise<void> {
    const box = this.size;
    const boxH = this.height ?? this.size;
    this.app = new Application();
    await this.app.init({
      canvas: this.canvasRef.nativeElement,
      width: box,
      height: boxH,
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

    if (this.mode === 'head') {
      // Position/scale the whole avatar so the head bbox centers in the
      // box, same as before — but that alone isn't a crop, it just leaves
      // the neck/shoulders (right below the head, same skin tone) to spill
      // into the canvas below the chin. Mask to the head's own bbox
      // (scaled) so only real head pixels can ever render here — see
      // HEAD_FILL's comment for why this replaced canvas-edge clipping.
      const zoom = (box * HEAD_FILL) / Math.max(HEAD_BBOX.w, HEAD_BBOX.h);
      this.avatar.scale.set(zoom);
      this.avatar.x = box / 2 - (HEAD_BBOX.x + HEAD_BBOX.w / 2) * zoom;
      this.avatar.y = boxH / 2 - (HEAD_BBOX.y + HEAD_BBOX.h / 2) * zoom;

      const maskW = HEAD_BBOX.w * zoom;
      const maskH = HEAD_BBOX.h * zoom;
      const mask = new Graphics()
        .rect((box - maskW) / 2, (boxH - maskH) / 2, maskW, maskH)
        .fill(0xffffff);
      this.app.stage.addChild(mask);
      this.avatar.mask = mask;
    } else {
      // Fit the 80x120 avatar (+socle) into the badge without cropping —
      // "contain", not "cover", so the socle at the feet stays visible. A
      // box matching AVATAR_W:AVATAR_H (via the `height` input) fills edge
      // to edge on the width axis, with HEAD_MARGIN of headroom reserved
      // above the nominal top (not a true zero-margin fit anymore — a tall
      // hat needs that room or it clips against the canvas edge).
      const zoom = Math.min(box / AVATAR_W, boxH / (AVATAR_H + HEAD_MARGIN));
      const contentH = (AVATAR_H + HEAD_MARGIN) * zoom;
      this.avatar.scale.set(zoom);
      this.avatar.x = (box - AVATAR_W * zoom) / 2;
      this.avatar.y = (boxH - contentH) / 2 + HEAD_MARGIN * zoom;
    }

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
