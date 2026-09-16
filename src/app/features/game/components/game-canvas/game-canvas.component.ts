import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
  inject,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { Application, Assets } from 'pixi.js';
import { GameCore, LoadingView, FurnitureView } from 'game-core';
import { RoomState, UserItemInfo, RoomErrorPayload, RoomPermission } from '@toon-live/game-types';
import { SocketService } from '../../../../core/services/socket.service';
import { AuthService } from '../../../../core/services/auth.service';
import { InventoryService } from '../../../../core/services/inventory.service';
import { UserActionDialogService } from '../../../../core/services/user-action-dialog.service';
import { FurniturePreviewService } from '../../../../core/services/furniture-preview.service';
import { ZoneTexturePickerService } from '../../../../core/services/zone-texture-picker.service';
import { environment } from '../../../../../environments/environment';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-game-canvas',
  standalone: true,
  template: `
    <canvas
      #canvas
      class="game-canvas"
      (dragover)="onCanvasDragOver($event)"
      (drop)="onCanvasDrop($event)"
    ></canvas>
    @if (editMode) {
      <div class="camera-pad" role="group" aria-label="Déplacer la caméra">
        <div
          #joystickBase
          class="joystick-base"
          (pointerdown)="onJoystickDown($event, joystickBase)"
          (pointermove)="onJoystickMove($event, joystickBase)"
          (pointerup)="onJoystickUp($event)"
          (pointercancel)="onJoystickUp($event)"
        >
          <div class="joystick-knob" [style.transform]="knobTransform()"></div>
        </div>
        <button class="recenter-btn" (click)="recenterCamera()" aria-label="Recentrer la caméra">
          <svg viewBox="0 0 24 24"><path d="M12 5V2L8 6l4 4V7c3.31 0 6 2.69 6 6a6 6 0 0 1-6 6 6 6 0 0 1-6-6H4a8 8 0 0 0 8 8 8 8 0 0 0 8-8 8 8 0 0 0-8-8z"/></svg>
        </button>
      </div>
    }
  `,
  styles: [`
    :host { display:block; width:100%; height:100%; position:relative; }
    .game-canvas { display:block; width:100%; height:100%; }
    .camera-pad {
      position: absolute;
      left: 16px;
      bottom: 16px;
      width: 96px;
      height: 96px;
      z-index: 10;
    }
    .joystick-base {
      width: 96px;
      height: 96px;
      border-radius: 50%;
      background: radial-gradient(circle at 50% 45%, rgba(30, 55, 68, 0.92) 0%, rgba(14, 30, 38, 0.92) 72%);
      box-shadow:
        0 4px 14px rgba(0, 0, 0, 0.35),
        inset 0 0 0 1px rgba(255, 255, 255, 0.12),
        inset 0 2px 4px rgba(255, 255, 255, 0.08);
      touch-action: none;
      cursor: pointer;
      position: relative;
    }
    .joystick-base::after {
      content: '';
      position: absolute;
      inset: 6px;
      border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, 0.1);
      pointer-events: none;
    }
    .joystick-knob {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 40px;
      height: 40px;
      margin: -20px 0 0 -20px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #4a7f92 0%, #294c58 100%);
      box-shadow:
        0 3px 8px rgba(0, 0, 0, 0.4),
        inset 0 0 0 1px rgba(255, 255, 255, 0.25);
      pointer-events: none;
      transition: box-shadow 0.1s;
    }
    .joystick-base:active .joystick-knob {
      box-shadow:
        0 3px 8px rgba(0, 0, 0, 0.4),
        inset 0 0 0 1px rgba(255, 213, 92, 0.6);
    }
    .recenter-btn {
      position: absolute;
      top: -6px;
      right: -6px;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: rgba(20, 40, 50, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.25);
      color: rgba(255, 255, 255, 0.85);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }
    .recenter-btn svg { width: 14px; height: 14px; fill: currentColor; }
    .recenter-btn:hover { color: #fff; background: rgba(20, 40, 50, 1); }
    .recenter-btn:active { color: #ffd35c; }
  `],
})
export class GameCanvasComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() roomId = '';
  @Input() editMode = false;
  @Input() zoneEditMode = false;
  /** Furniture dropped from the inventory onto the canvas while not editing
   *  auto-switches edit mode on (see startPlacingFurniture) — the parent
   *  owns the actual signal, this just reports the change back up. */
  @Output() editModeChange = new EventEmitter<boolean>();

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private socket    = inject(SocketService);
  private auth      = inject(AuthService);
  private inventory = inject(InventoryService);
  private userActionDialog = inject(UserActionDialogService);
  private furniturePreview = inject(FurniturePreviewService);
  private zoneTexturePicker = inject(ZoneTexturePickerService);

  private app: Application | null = null;
  private gc:  GameCore | null    = null;
  private loadingView: LoadingView | null = null;
  private subs: Subscription[]    = [];
  private initDone = false;
  private myId = '';
  /** True once the map is loaded and avatars can be spawned into the scene. */
  private worldReady = false;
  private walkTimers   = new Map<string, ReturnType<typeof setTimeout>>();
  private remoteTargets = new Map<string, { x: number; y: number }>();
  /** instanceId -> catalogue info, for the click-to-preview panel (name/
   *  displayImage aren't on GameCore's own lightweight Furniture model). */
  private furnitureMeta = new Map<number, { name: string; displayImage: string | null; orientation: number }>();

  /** userItemIds dont J'AI envoyé le placement et dont j'attends l'écho
   *  serveur — sert à ne rafraîchir l'inventaire que sur mes propres
   *  placements (voir furniturePlace$). */
  private myPlacements = new Set<number>();
  /** userId -> last clothing map applied, so avatarAppearance$ can detect a
   *  category that dropped out (unequip) and actually clear it — see there. */
  private lastClothingByAvatar = new Map<string, Record<string, string>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private lerpTicker: ((ticker: any) => void) | null = null;

  ngAfterViewInit(): void {
    this.startLoading();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['editMode'] && this.gc) {
      this.gc.setEditMode(this.editMode);
      // The follow-camera tick fights manual panning every frame otherwise —
      // free the camera while editing, hand it back to the avatar on exit.
      this.gc.setFollowCamera(!this.editMode);
      if (!this.editMode) this.stopPan();
    }
    if (changes['zoneEditMode'] && this.gc) {
      this.gc.setZoneEditMode(this.zoneEditMode);
      if (!this.zoneEditMode) this.zoneTexturePicker.close();
    }
  }

  // ── Camera joystick (edit mode) ──────────────────────────────────────────
  // Continuous analog drag instead of the old 8-button D-pad: the knob's
  // offset from center (clamped to the base's radius) is read every tick by
  // a single running interval, rather than each pointer event starting/
  // restarting its own timer — matches a real joystick, and stays smooth as
  // the knob is dragged around mid-pan instead of snapping between fixed
  // -1/0/1 directions.

  private panTimer?: ReturnType<typeof setInterval>;
  private static readonly PAN_STEP = 16;    // px per tick at full deflection
  private static readonly PAN_INTERVAL_MS = 30;
  private static readonly KNOB_MAX_OFFSET = 28; // px, base radius(48) - knob radius(20)

  private activePointerId: number | null = null;
  private panVector = { dx: 0, dy: 0 };     // normalized, -1..1 on each axis
  private knobOffset = { x: 0, y: 0 };      // px, for the knob's transform

  knobTransform(): string {
    return `translate(${this.knobOffset.x}px, ${this.knobOffset.y}px)`;
  }

  onJoystickDown(ev: PointerEvent, baseEl: HTMLElement): void {
    ev.preventDefault();
    this.activePointerId = ev.pointerId;
    baseEl.setPointerCapture(ev.pointerId);
    this.updateJoystick(ev, baseEl);
  }

  onJoystickMove(ev: PointerEvent, baseEl: HTMLElement): void {
    if (this.activePointerId !== ev.pointerId) return;
    this.updateJoystick(ev, baseEl);
  }

  onJoystickUp(ev: PointerEvent): void {
    if (this.activePointerId !== ev.pointerId) return;
    this.activePointerId = null;
    this.knobOffset = { x: 0, y: 0 };
    this.stopPan();
  }

  private updateJoystick(ev: PointerEvent, baseEl: HTMLElement): void {
    const rect = baseEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = ev.clientX - cx;
    let dy = ev.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const max = GameCanvasComponent.KNOB_MAX_OFFSET;
    if (dist > max) {
      dx = (dx / dist) * max;
      dy = (dy / dist) * max;
    }
    this.knobOffset = { x: dx, y: dy };
    this.panVector = { dx: dx / max, dy: dy / max };
    this.ensurePanTimer();
  }

  private ensurePanTimer(): void {
    if (this.panTimer) return;
    this.panTimer = setInterval(() => {
      const { dx, dy } = this.panVector;
      if (dx !== 0 || dy !== 0) {
        this.gc?.panCamera(dx * GameCanvasComponent.PAN_STEP, dy * GameCanvasComponent.PAN_STEP);
      }
    }, GameCanvasComponent.PAN_INTERVAL_MS);
  }

  stopPan(): void {
    clearInterval(this.panTimer);
    this.panTimer = undefined;
    this.panVector = { dx: 0, dy: 0 };
  }

  recenterCamera(): void {
    this.gc?.centerCameraOnAvatar(this.myId);
  }

  private async startLoading(): Promise<void> {
    if (this.initDone) return;
    this.initDone = true;

    const canvas = this.canvasRef.nativeElement;
    const parent = canvas.parentElement!;

    // ── PIXI Application ──────────────────────────────────────────────────────
    this.app = new Application();
    await this.app.init({
      canvas,
      background: '#1a3a4a',
      antialias: true,
      // See avatar-badge.component.ts's identical comment: the avatar body
      // sheet is a 3x source downscaled, which showed visible jaggies on the
      // in-game character at native DPR. Supersampled here too so the whole
      // scene (not just badges) gets the extra bilinear-filter samples.
      // 2 and not more, for the same reason as the badge (its comment has
      // the measurements): above 2 the browser's own bilinear downscale of
      // the canvas stops being a correct box filter and adds aliasing back.
      // The ~1.5x minification left over is what the mipmap chain
      // (BaseTextureLoader.enableMipmaps) is there to handle.
      resolution: Math.max(2, window.devicePixelRatio ?? 1),
      autoDensity: true,
      resizeTo: parent,
    });

    // ── GameCore ──────────────────────────────────────────────────────────────
    this.gc = new GameCore(this.app, {
      followCamera:    true,
      cameraMargin:    150,
      cameraSmoothing: 0.1,
      moveSpeed:       5,
      cameraMode:      'lookahead',
      assetsUrl:       environment.assetsUrl,
    });
    this.gc.setCameraPosition(400, 300);

    // ── Étape 1 : écran de chargement immédiat ────────────────────────────────
    // Pré-charger la texture vidéo pour que le Sprite ait des dimensions correctes
    await Assets.load('assets/ui/loading.webm').catch(() => null);
    this.loadingView = new LoadingView();
    this.loadingView.draw(this.app.screen.width, this.app.screen.height);
    this.app.stage.addChild(this.loadingView);
    this.loadingView.setMessage('Connexion au serveur...');
    this.loadingView.setProgress(0.1);

    // Redessiner le fond si le canvas est redimensionné pendant le chargement
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onResize = (w: number, h: number) => this.loadingView?.draw(w, h);
    this.app.renderer.on('resize', onResize);

    // ── Étape 2 : attendre la connexion socket ────────────────────────────────
    await new Promise<void>((resolve) => {
      if (this.socket.isConnected()) { resolve(); return; }
      const check = setInterval(() => {
        if (this.socket.isConnected()) { clearInterval(check); resolve(); }
      }, 100);
    });

    // Subscribe before any further awaiting. The room events below are plain
    // Subjects with no replay, so anything emitted while nobody is listening is
    // lost for good — and the map load further down takes long enough that a
    // player joining during it would be missed by both the roomState snapshot
    // (taken before they joined) and their own userJoined event (dropped here),
    // leaving them invisible for the rest of the session.
    this.myId = this.auth.user()!.id;
    this.subscribeToRoomEvents();

    this.loadingView.setMessage('Chargement de la maison...');
    this.loadingView.setProgress(0.3);

    // ── Étape 3 : attendre le roomState ──────────────────────────────────────
    const state = await new Promise<RoomState>((resolve) => {
      const s = this.socket.roomState();
      if (s) { resolve(s); return; }
      const check = setInterval(() => {
        const s2 = this.socket.roomState();
        if (s2) { clearInterval(check); resolve(s2); }
      }, 100);
    });

    this.loadingView.setMessage('Chargement de la carte...');
    this.loadingView.setProgress(0.5);

    // ── Étape 4 : charger la map ──────────────────────────────────────────────
    try {
      await this.gc.loadHouse(state.houseData);
    } catch (e) {
      console.error('[GameCanvas] loadHouse failed:', e);
      return;
    }

    // Meubles déjà placés dans la room (snapshot du join — voir subscribeToRoomEvents
    // pour les placements/déplacements qui arrivent APRÈS, en direct).
    for (const f of state.furnitures ?? []) {
      await this.gc.spawnFurniture(
        Number(f.instanceId), f.baseId, 18, `${f.spriteKey}/${f.spritePath}`,
        f.x, f.y, f.orientation,
      );
      this.furnitureMeta.set(Number(f.instanceId), { name: f.name, displayImage: f.displayImage, orientation: f.orientation });
    }

    // Papiers peints/sols déjà appliqués dans la room — même principe que les
    // meubles ci-dessus (snapshot du join, le direct arrive via remoteTextureApply$/
    // remoteTextureRemove$ dans subscribeToRoomEvents).
    for (const t of state.textures ?? []) {
      await this.gc.applyTexture(t.zoneType, t.zoneIndex, t.baseId, t.spritePath);
    }

    this.loadingView.setMessage('Chargement des joueurs...');
    this.loadingView.setProgress(0.8);

    // ── Étape 5 : spawner les avatars ─────────────────────────────────────────
    const myUsername  = this.auth.user()!.username;
    const mySkinColor = this.auth.user()!.skinColor ?? 0xffffff;

    // Trouver les données du joueur courant dans le roomState
    const myRoomUser = state.users.find(u => u.userId === this.myId);

    // Server now spawns joiners at the room's own door (RoomStateService.join /
    // HouseGeometry — this.x/y from the socket handshake, not a client guess).
    // 300,300 stays only as a last-resort fallback for the (shouldn't-happen)
    // case where our own entry is somehow missing from the snapshot.
    this.gc.spawnAvatar(this.myId, myRoomUser?.x ?? 300, myRoomUser?.y ?? 300, {
      // The socle (pedestal/shadow base) is a preview-badge device — see
      // AvatarBadgeComponent (identity-card, profile) — not something an
      // in-room character standing/walking around a house should show.
      showSocle: false,
      direction: myRoomUser?.direction ?? 1,
      username:  myUsername,
      skinColor: myRoomUser?.skinColor ?? mySkinColor,
      clothing:  myRoomUser?.clothing ?? {},
    });
    this.gc.bindPlayerInput(this.myId);

    // Wirer l'inventaire pour notifier le serveur après equip/unequip, et pour
    // démarrer un placement meuble (voir startPlacingFurniture).
    this.inventory.currentRoomId = this.roomId;
    this.inventory.onClothingChanged = (roomId) => this.socket.clothingRefresh(roomId);
    this.inventory.onPlaceFurniture = (item) => this.startPlacingFurniture(item);

    this.gc.on('avatar:walking', ({ id, avatar, direction }) => {
      if (id === this.myId) {
        this.socket.sendAvatarMove(this.roomId, avatar.x, avatar.y, direction);
      }
    });

    this.gc.on('avatar:stopped', ({ id }) => {
      if (id === this.myId) {
        this.socket.sendAvatarStop(this.roomId);
      }
    });

    this.gc.on('avatar:click', ({ id }) => {
      if (id === this.myId) return;
      const user = this.socket.roomState()?.users.find(u => u.userId === id);
      if (user) this.userActionDialog.open(user);
    });

    this.gc.on('furniture:click', ({ instanceId }) => {
      const meta = this.furnitureMeta.get(instanceId);
      if (!meta) return;
      this.furniturePreview.open({ instanceId, name: meta.name, displayImage: meta.displayImage, orientation: meta.orientation });
    });

    // Only ever fires while zoneEditMode is on (AreaView/WallView gate their
    // own interactivity on it — see HouseView.setZoneEditMode), so no extra
    // check needed here.
    this.gc.on('zone:click', ({ zoneType, zoneIndex }) => {
      this.zoneTexturePicker.open({ zoneType, zoneIndex });
    });

    // The world can host avatars from here on. Reconcile against the live room
    // membership rather than the `state` snapshot captured before the map load:
    // anyone who joined in between is already in the signal.
    this.worldReady = true;
    this.reconcileAvatars();

    // ── Interpolation lerp pour les avatars distants ─────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.lerpTicker = (ticker: any) => {
      const dt: number = ticker.deltaTime ?? 1;
      for (const [userId, target] of this.remoteTargets) {
        const av = this.gc?.getAvatar(userId);
        if (!av) { this.remoteTargets.delete(userId); continue; }
        const dx = target.x - av.x;
        const dy = target.y - av.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.5) {
          av.x = target.x;
          av.y = target.y;
        } else {
          av.x += dx * Math.min(1, 0.25 * dt);
          av.y += dy * Math.min(1, 0.25 * dt);
        }
        av.updateZIndex();
      }
    };
    this.app.ticker.add(this.lerpTicker);

    if (this.editMode) this.gc.setEditMode(true);

    // ── Étape 6 : prêt → slide-out vers le haut ──────────────────────────────
    this.app.renderer.off('resize', onResize);
    this.loadingView.setMessage('Prêt !');
    this.loadingView.setProgress(1.0);

    await new Promise<void>((resolve) => {
      const totalMs = 400;
      let   elapsed = 0;
      const targetY = -(this.app!.screen.height + 10);
      const lv      = this.loadingView!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const slideOut = (ticker: any) => {
        elapsed += (ticker.deltaMS as number);
        const t = Math.min(elapsed / totalMs, 1);
        lv.y = targetY * (t * t);
        if (t >= 1) {
          this.app!.ticker.remove(slideOut);
          this.app!.stage.removeChild(lv);
          this.loadingView = null;
          resolve();
        }
      };
      this.app!.ticker.add(slideOut);
    });
  }

  /**
   * Wire every room event. Safe to call before the world exists: membership
   * changes are reconciled from SocketService's roomState signal (which stays
   * authoritative on its own), and the per-avatar handlers no-op until their
   * avatar is in the scene.
   */
  private subscribeToRoomEvents(): void {
    this.subs.push(
      this.socket.userJoined$.subscribe(() => this.reconcileAvatars()),
      this.socket.userLeft$.subscribe((p) => {
        this.remoteTargets.delete(p.userId);
        clearTimeout(this.walkTimers.get(p.userId));
        this.walkTimers.delete(p.userId);
        this.reconcileAvatars();
      }),
      this.socket.remoteMove$.subscribe((p) => {
        // /topic/room/{id}/avatar-move is a plain broadcast, so the server
        // sends every move straight back to whoever made it (confirmed live:
        // 16/16 avatar-move frames received while walking alone in a room
        // carried my own userId). Applying that echo to my own avatar made
        // the lerp below drag it back toward an already-stale server position
        // while changeDirection() overwrote my current facing with the one
        // from a packet or two ago — that is the "the toon faces somewhere
        // unrelated to where it's actually walking" bug. My own avatar is
        // authoritative locally; only other players' come off the wire.
        if (p.userId === this.myId) return;
        const remoteAvatar = this.gc?.getAvatar(p.userId);
        if (!remoteAvatar) return;
        this.remoteTargets.set(p.userId, { x: p.x, y: p.y });
        remoteAvatar.changeDirection(p.direction);
        remoteAvatar.walk();
        clearTimeout(this.walkTimers.get(p.userId));
        // Safety-net only: an explicit 'avatar-stop' normally stops the walk
        // animation immediately. This fallback just covers a lost/dropped stop
        // packet, so it can afford a more generous margin.
        this.walkTimers.set(p.userId, setTimeout(() => {
          this.gc?.getAvatar(p.userId)?.stopWalk();
        }, 600));
      }),
      this.socket.remoteStop$.subscribe((p) => {
        // Same self-echo as avatar-move above: my own stop comes back to me
        // and would cut the walk animation while I'm still holding a key.
        if (p.userId === this.myId) return;
        clearTimeout(this.walkTimers.get(p.userId));
        this.walkTimers.delete(p.userId);
        this.gc?.getAvatar(p.userId)?.stopWalk();
      }),
      this.socket.remoteSay$.subscribe((p) => {
        this.gc?.getAvatar(p.userId)?.say(p.text, 2500);
      }),
      this.socket.chatMessage$.subscribe((p) => {
        this.gc?.getAvatar(p.userId)?.say(p.text, 2500);
      }),
      // Only the sender's and recipient's own sockets ever receive this
      // (RoomModerationService.sendPrivateMessage — two individual sends,
      // not a topic broadcast), so showing it above the sender's head can't
      // leak the mp to anyone else in the room.
      this.socket.privateMessage$.subscribe((p) => {
        this.gc?.getAvatar(p.fromUserId)?.say(p.text, 2500, true);
      }),
      this.socket.avatarAppearance$.subscribe((p) => {
        const avatar = this.gc?.getAvatar(p.userId);
        if (!avatar) return;
        avatar.setSkinColor(p.skinColor);
        // p.clothing only lists what's currently equipped — an unequip just
        // drops that category from the map, it's never sent back with an
        // empty value. Without diffing against what was last shown, a
        // category missing from the new payload never gets a changeClothing
        // call at all, so the old sprite for it just stays on screen
        // forever (looked like the 'Retirer' button did nothing).
        const previous = this.lastClothingByAvatar.get(p.userId) ?? {};
        for (const category of Object.keys(previous)) {
          if (!(category in p.clothing)) avatar.changeClothing(category);
        }
        for (const [category, id] of Object.entries(p.clothing)) {
          avatar.changeClothing(category, id);
        }
        this.lastClothingByAvatar.set(p.userId, p.clothing);
      }),
      // Placement/déplacement/rotation/retrait de meuble — diffusé à toute la
      // room, y compris à soi-même (même principe que l'équipement de
      // vêtements : celui qui place est juste un abonné de plus au topic, pas
      // de rendu optimiste séparé — voir startPlacingFurniture qui retire son
      // propre fantôme local et laisse cet écho créer le vrai meuble).
      this.socket.furniturePlace$.subscribe((p) => {
        this.gc?.spawnFurniture(
          Number(p.instanceId), p.baseId, 18, `${p.spriteKey}/${p.spritePath}`,
          p.x, p.y, p.orientation,
        );
        this.furnitureMeta.set(Number(p.instanceId), { name: p.name, displayImage: p.displayImage, orientation: p.orientation });
        // Le serveur vient de poser `placed_in_room_id` : l'item a quitté
        // l'inventaire. Le panneau reste ouvert pendant un glisser-déposer,
        // donc il faut le lui dire (voir InventoryService.itemsChanged$).
        // Restreint aux pièces que J'AI posées : le placement d'un autre
        // joueur ne change rien à mon inventaire.
        if (this.myPlacements.delete(Number(p.instanceId))) {
          this.inventory.itemsChanged$.next();
        }
      }),
      this.socket.furnitureMove$.subscribe((p) => {
        this.gc?.moveFurniture(Number(p.instanceId), p.x, p.y);
      }),
      this.socket.furnitureRotate$.subscribe((p) => {
        this.gc?.rotateFurniture(Number(p.instanceId), p.orientation);
        const meta = this.furnitureMeta.get(Number(p.instanceId));
        if (meta) meta.orientation = p.orientation;
        this.furniturePreview.updateOrientation(Number(p.instanceId), p.orientation);
      }),
      this.socket.furnitureRemove$.subscribe((p) => {
        this.gc?.removeFurniture(Number(p.instanceId));
        this.furnitureMeta.delete(Number(p.instanceId));
        // "Prendre" remet la pièce dans l'inventaire de son propriétaire.
        // L'écho ne dit pas qui c'est, donc on recharge dans tous les cas —
        // ça ne coûte une requête que si le panneau est ouvert (personne
        // n'est abonné à itemsChanged$ sinon).
        this.inventory.itemsChanged$.next();
        // A "prendre" on the piece currently shown in the preview panel
        // (or a remove from anyone else while it's open) should close it —
        // nothing left to take, keeping it open would offer a dead action.
        if (this.furniturePreview.target()?.instanceId === Number(p.instanceId)) {
          this.furniturePreview.close();
        }
      }),
      // Papier peint/sol posé ou retiré — même diffusion "tout le monde,
      // y compris qui vient de le faire" que les meubles ci-dessus.
      this.socket.textureApply$.subscribe((p) => {
        this.gc?.applyTexture(p.zoneType, p.zoneIndex, p.baseId, p.spritePath);
        this.inventory.itemsChanged$.next();
        this.zoneTexturePicker.close();
      }),
      this.socket.textureRemove$.subscribe((p) => {
        this.gc?.resetTexture(p.zoneType, p.zoneIndex);
        this.inventory.itemsChanged$.next();
        this.zoneTexturePicker.close();
      }),
    );
  }

  /**
   * Placement d'un meuble depuis l'inventaire : fait apparaître un fantôme
   * local à une position par défaut, réutilise le drag déjà câblé sur
   * FurnitureView (activé par setEditMode(true) — un simple clic sans
   * bouger suffit aussi à "confirmer", startDrag+endDrag se déclenchent
   * même sans mouvement). Confirmation = premier relâchement : envoie le
   * placement réel au serveur puis retire le fantôme local (le vrai meuble
   * arrive par l'écho broadcast, voir subscribeToRoomEvents). Échap annule
   * et retire le fantôme sans rien envoyer.
   */
  /** A native browser dragover must call preventDefault() or drop never fires. */
  onCanvasDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  /** InventoryComponent.onDragStart stashed the item on InventoryService —
   *  see startPlacingFurniture for the auto-edit-mode-on-drop behaviour. */
  onCanvasDrop(event: DragEvent): void {
    event.preventDefault();
    const item = this.inventory.dragPayload;
    this.inventory.dragPayload = null;
    if (!item) return;
    const pos = this.gc?.screenToHouseLocal(event.clientX, event.clientY) ?? undefined;
    this.startPlacingFurniture(item, pos);
  }

  private async startPlacingFurniture(item: UserItemInfo, spawnPos?: { x: number; y: number }): Promise<void> {
    if (!this.gc || !item.id || item.placedInRoomId) return;
    if (!item.item.spriteKey || !item.item.spritePath) return;

    // Le serveur revalide de toute façon (FurnitureStateService.assertCanManageRoom) —
    // ce garde-fou est là pour donner un retour immédiat plutôt que de laisser
    // l'utilisateur draguer un fantôme pour rien et voir l'échec après coup.
    // Plus de refus silencieux si le mode édition est OFF : on l'active à la
    // volée (glisser un meuble depuis l'inventaire vers la room revient à
    // demander à éditer) tant que l'utilisateur a le droit de le faire —
    // sinon même message d'erreur qu'avant.
    if (!this.editMode) {
      const state = this.socket.roomState();
      const canEdit = !!state && state.yourPermission >= RoomPermission.OWN;
      if (!canEdit) {
        this.gc.getAvatar(this.myId)?.say(
          "Vous n'avez pas le droit d'éditer cette maison.", 3000);
        return;
      }
      this.editMode = true;
      this.editModeChange.emit(true);
      this.gc.setFollowCamera(false);
    }

    const userItemId = item.id;
    const file = `${item.item.spriteKey}/${item.item.spritePath}`;
    // Dropped from the inventory: appear where the drag actually ended
    // instead of a fixed spot the player then had to drag again from
    // scratch. Click-to-place (no drag) keeps the old default.
    const { x, y } = spawnPos ?? { x: 400, y: 300 };
    const ghostView = await this.gc.spawnFurniture(userItemId, item.item.id, 18, file, x, y, 1);
    if (!ghostView || !this.gc) return;

    // Seed furnitureMeta right away instead of waiting for the server's
    // furniturePlace$ echo — the ghost's own confirm click can fire
    // 'furniture:click' synchronously (a plain click with zero movement
    // never even leaves this tick), which is well before that round-trip
    // could possibly land, so the preview panel would silently no-op on
    // the very first click and need a second, separate one to catch up.
    this.furnitureMeta.set(userItemId, { name: item.item.name, displayImage: item.item.displayImage, orientation: 1 });

    this.gc.setEditMode(true);

    // Edit mode stays on after placing — was already guaranteed on above
    // (guard either found it on, or just switched it on), no reason to snap
    // back off right after one piece.
    const cleanup = () => {
      this.gc?.off('furniture:placed', onPlaced);
      document.removeEventListener('keydown', onKeyDown);
      errorSub.unsubscribe();
    };

    const onPlaced = ({ view }: { view: FurnitureView }) => {
      if (view !== ghostView) return; // un autre meuble vient d'être déplacé, pas le nôtre
      const { x, y, orientation } = view.model;
      this.myPlacements.add(userItemId);
      this.socket.sendFurniturePlace(this.roomId, { userItemId, x, y, orientation });
      this.gc?.removeFurniture(userItemId);
      cleanup();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      this.gc?.removeFurniture(userItemId);
      this.furnitureMeta.delete(userItemId); // never actually placed — drop the meta seeded above
      if (this.furniturePreview.target()?.instanceId === userItemId) this.furniturePreview.close();
      cleanup();
    };

    // Placement peut être refusé côté serveur (pas propriétaire de la room —
    // seuls les admins peuvent placer partout, voir FurnitureStateService).
    // Sans ça le fantôme local disparaissait déjà (removeFurniture est
    // toujours appelé côté serveur en échec puisqu'aucun echo furniture-place
    // n'arrive jamais), mais silencieusement : le joueur ne savait pas pourquoi.
    const errorSub = this.socket.roomError$.subscribe((e: RoomErrorPayload) => {
      if (e.code !== 'FURNITURE_ACTION_FAILED') return;
      this.myPlacements.delete(userItemId); // refus serveur : aucun écho ne viendra
      this.gc?.removeFurniture(userItemId);
      this.furnitureMeta.delete(userItemId); // never actually placed — drop the meta seeded above
      if (this.furniturePreview.target()?.instanceId === userItemId) this.furniturePreview.close();
      this.gc?.getAvatar(this.myId)?.say(e.message, 3000);
      cleanup();
    });

    this.gc.on('furniture:placed', onPlaced);
    document.addEventListener('keydown', onKeyDown);
  }

  /**
   * Make the avatars in the scene match the room membership the server last
   * reported. Spawns whoever is missing and despawns whoever left, so a dropped
   * or out-of-order join/leave event can never leave a player permanently
   * invisible (or a ghost behind).
   */
  private reconcileAvatars(): void {
    if (!this.worldReady || !this.gc) return;

    const users = this.socket.roomState()?.users ?? [];
    const expected = new Set<string>([this.myId]);

    for (const u of users) {
      expected.add(u.userId);
      if (u.userId === this.myId || this.gc.getAvatar(u.userId)) continue;
      try {
        this.gc.spawnAvatar(u.userId, u.x, u.y, {
          showSocle: false, // see the same-reasoning comment on the local avatar's own spawnAvatar call above
          username:  u.username,
          direction: u.direction,
          skinColor: u.skinColor,
          clothing:  u.clothing,
        });
      } catch (e) {
        console.warn('[GameCanvas] spawnAvatar failed for', u.userId, e);
      }
    }

    for (const id of [...this.gc.getAvatars().keys()]) {
      if (expected.has(id)) continue;
      this.gc.removeAvatar(id);
      this.remoteTargets.delete(id);
      clearTimeout(this.walkTimers.get(id));
      this.walkTimers.delete(id);
    }
  }

  ngOnDestroy(): void {
    this.stopPan();
    this.inventory.onClothingChanged = null;
    this.inventory.onPlaceFurniture = null;
    this.inventory.currentRoomId = null;
    this.subs.forEach((s) => s.unsubscribe());
    this.walkTimers.forEach((t) => clearTimeout(t));
    this.walkTimers.clear();
    if (this.lerpTicker && this.app) this.app.ticker.remove(this.lerpTicker);
    this.lerpTicker = null;
    this.remoteTargets.clear();
    // Arrêter le ticker avant de détruire l'app pour éviter les erreurs PIXI
    this.app?.ticker.stop();
    this.gc?.getAvatars().forEach((_, id) => this.gc?.removeAvatar(id));
    this.app?.destroy(false, { children: true });
    this.app = null;
    this.gc  = null;
  }
}

