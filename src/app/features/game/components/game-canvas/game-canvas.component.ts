import {
  Component,
  Input,
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
import { RoomState, UserItemInfo } from '@toon-live/game-types';
import { SocketService } from '../../../../core/services/socket.service';
import { AuthService } from '../../../../core/services/auth.service';
import { InventoryService } from '../../../../core/services/inventory.service';
import { environment } from '../../../../../environments/environment';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-game-canvas',
  standalone: true,
  template: `<canvas #canvas class="game-canvas"></canvas>`,
  styles: [`:host { display:block; width:100%; height:100%; }
            .game-canvas { display:block; width:100%; height:100%; }`],
})
export class GameCanvasComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() roomId = '';
  @Input() editMode = false;

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private socket    = inject(SocketService);
  private auth      = inject(AuthService);
  private inventory = inject(InventoryService);

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private lerpTicker: ((ticker: any) => void) | null = null;

  ngAfterViewInit(): void {
    this.startLoading();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['editMode'] && this.gc) {
      this.gc.setEditMode(this.editMode);
    }
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
      resolution: window.devicePixelRatio ?? 1,
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

    this.loadingView.setMessage('Chargement de la room...');
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
    }

    this.loadingView.setMessage('Chargement des joueurs...');
    this.loadingView.setProgress(0.8);

    // ── Étape 5 : spawner les avatars ─────────────────────────────────────────
    const myUsername  = this.auth.user()!.username;
    const mySkinColor = this.auth.user()!.skinColor ?? 0xf7ceaf;

    // Trouver les données du joueur courant dans le roomState
    const myRoomUser = state.users.find(u => u.userId === this.myId);

    this.gc.spawnAvatar(this.myId, 300, 300, {
      showSocle: true,
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
      this.socket.avatarAppearance$.subscribe((p) => {
        const avatar = this.gc?.getAvatar(p.userId);
        if (!avatar) return;
        avatar.setSkinColor(p.skinColor);
        for (const [category, id] of Object.entries(p.clothing)) {
          avatar.changeClothing(category, id);
        }
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
      }),
      this.socket.furnitureMove$.subscribe((p) => {
        this.gc?.moveFurniture(Number(p.instanceId), p.x, p.y);
      }),
      this.socket.furnitureRotate$.subscribe((p) => {
        this.gc?.rotateFurniture(Number(p.instanceId), p.orientation);
      }),
      this.socket.furnitureRemove$.subscribe((p) => {
        this.gc?.removeFurniture(Number(p.instanceId));
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
  private async startPlacingFurniture(item: UserItemInfo): Promise<void> {
    if (!this.gc || !item.id || item.placedInRoomId) return;
    if (!item.item.spriteKey || !item.item.spritePath) return;

    const userItemId = item.id;
    const file = `${item.item.spriteKey}/${item.item.spritePath}`;
    const ghostView = await this.gc.spawnFurniture(userItemId, item.item.id, 18, file, 400, 300, 1);
    if (!ghostView || !this.gc) return;

    const wasEditMode = this.editMode;
    this.gc.setEditMode(true);

    const cleanup = () => {
      this.gc?.off('furniture:placed', onPlaced);
      document.removeEventListener('keydown', onKeyDown);
      this.gc?.setEditMode(wasEditMode);
    };

    const onPlaced = ({ view }: { view: FurnitureView }) => {
      if (view !== ghostView) return; // un autre meuble vient d'être déplacé, pas le nôtre
      const { x, y, orientation } = view.model;
      this.socket.sendFurniturePlace(this.roomId, { userItemId, x, y, orientation });
      this.gc?.removeFurniture(userItemId);
      cleanup();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      this.gc?.removeFurniture(userItemId);
      cleanup();
    };

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

