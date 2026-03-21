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
import { GameCore, LoadingView } from 'game-core';
import { RoomState } from '@toon-live/game-types';
import { SocketService } from '../../../../core/services/socket.service';
import { AuthService } from '../../../../core/services/auth.service';
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

  private socket = inject(SocketService);
  private auth   = inject(AuthService);

  private app: Application | null = null;
  private gc:  GameCore | null    = null;
  private loadingView: LoadingView | null = null;
  private subs: Subscription[]    = [];
  private initDone = false;
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

    this.loadingView.setMessage('Chargement des joueurs...');
    this.loadingView.setProgress(0.8);

    // ── Étape 5 : spawner les avatars ─────────────────────────────────────────
    const myId       = this.auth.user()!.id;
    const myUsername = this.auth.user()!.username;

    this.gc.spawnAvatar(myId, 300, 300, {
      showSocle: true,
      direction: 1,
      username:  myUsername,
    });
    this.gc.bindPlayerInput(myId);

    this.gc.on('avatar:walking', ({ id, avatar, direction }) => {
      if (id === myId) {
        this.socket.sendAvatarMove(this.roomId, avatar.x, avatar.y, direction);
      }
    });

    for (const u of state.users) {
      if (u.userId !== myId && !this.gc.getAvatar(u.userId)) {
        try {
          this.gc.spawnAvatar(u.userId, u.x, u.y, { username: u.username });
        } catch (e) {
          console.warn('[GameCanvas] spawnAvatar failed for', u.userId, e);
        }
      }
    }

    // ── Réagir aux événements réseau ──────────────────────────────────────────
    this.subs.push(
      this.socket.userJoined$.subscribe((p) => {
        if (p.userId === myId || this.gc?.getAvatar(p.userId)) return;
        this.gc?.spawnAvatar(p.userId, p.x, p.y, { username: p.username });
      }),
      this.socket.userLeft$.subscribe((p) => {
        this.gc?.removeAvatar(p.userId);
        this.remoteTargets.delete(p.userId);
        clearTimeout(this.walkTimers.get(p.userId));
        this.walkTimers.delete(p.userId);
      }),
      this.socket.remoteMove$.subscribe((p) => {
        const remoteAvatar = this.gc?.getAvatar(p.userId);
        if (!remoteAvatar) return;
        this.remoteTargets.set(p.userId, { x: p.x, y: p.y });
        remoteAvatar.changeDirection(p.direction);
        remoteAvatar.walk();
        clearTimeout(this.walkTimers.get(p.userId));
        this.walkTimers.set(p.userId, setTimeout(() => {
          this.gc?.getAvatar(p.userId)?.stopWalk();
        }, 250));
      }),
      this.socket.remoteSay$.subscribe((p) => {
        this.gc?.getAvatar(p.userId)?.say(p.text, 2500);
      }),
      this.socket.chatMessage$.subscribe((p) => {
        this.gc?.getAvatar(p.userId)?.say(p.text, 2500);
      }),
    );

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

  ngOnDestroy(): void {
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

