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
import { Application } from 'pixi.js';
import { GameCore } from 'game-core';
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
  private subs: Subscription[]    = [];
  private initDone = false;
  private walkTimers   = new Map<string, ReturnType<typeof setTimeout>>();
  private remoteTargets = new Map<string, { x: number; y: number }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private lerpTicker: ((ticker: any) => void) | null = null;

  ngAfterViewInit(): void {
    // Attendre que roomState soit disponible avant d'initialiser
    const state = this.socket.roomState();
    if (state) {
      console.log('[GameCanvas] roomState already available, init now');
      this.initGameCore(state.houseXml, state.users);
    } else {
      console.log('[GameCanvas] waiting for roomState…');
      const interval = setInterval(() => {
        const s = this.socket.roomState();
        if (s) {
          clearInterval(interval);
          console.log('[GameCanvas] roomState received, init now');
          this.initGameCore(s.houseXml, s.users);
        }
      }, 100);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['editMode'] && this.gc) {
      this.gc.setEditMode(this.editMode);
    }
  }

  private async initGameCore(
    houseXml: string,
    existingUsers: Array<{ userId: string; username: string; x: number; y: number }>,
  ): Promise<void> {
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

    // ── Charger la map ────────────────────────────────────────────────────────
    try {
      await this.gc.loadHouse(houseXml);
    } catch (e) {
      console.error('[GameCanvas] loadHouse failed:', e);
      return;
    }

    // ── Avatar local ──────────────────────────────────────────────────────────
    const myId       = this.auth.user()!.id;
    const myUsername = this.auth.user()!.username;

    this.gc.spawnAvatar(myId, 300, 300, {
      showSocle: true,
      direction: 1,
      username:  myUsername,
    });
    this.gc.bindPlayerInput(myId);

    // ── Transmettre les déplacements locaux au serveur (y compris lors de collisions) ─────
    this.gc.on('avatar:walking', ({ id, avatar, direction }) => {
      if (id === myId) {
        this.socket.sendAvatarMove(this.roomId, avatar.x, avatar.y, direction);
      }
    });

    // ── Spawner les avatars déjà présents dans la salle ───────────────────────
    for (const u of existingUsers) {
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
      // Quelqu'un rejoint
      this.socket.userJoined$.subscribe((p) => {
        if (p.userId === myId || this.gc?.getAvatar(p.userId)) return;
        this.gc?.spawnAvatar(p.userId, p.x, p.y, { username: p.username });
      }),

      // Quelqu'un part
      this.socket.userLeft$.subscribe((p) => {
        this.gc?.removeAvatar(p.userId);
        this.remoteTargets.delete(p.userId);
        clearTimeout(this.walkTimers.get(p.userId));
        this.walkTimers.delete(p.userId);
      }),

      // Déplacement distant : mise à jour de la cible lerp
      this.socket.remoteMove$.subscribe((p) => {
        const remoteAvatar = this.gc?.getAvatar(p.userId);
        if (!remoteAvatar) return;
        // Mise à jour de la cible d'interpolation (pas de set direct = pas de téléportation)
        this.remoteTargets.set(p.userId, { x: p.x, y: p.y });
        // changeDirection() réinitialise les textures PIXI → arrête l'AnimatedSprite
        // → toujours rappeler walk() ensuite pour relancer l'animation
        remoteAvatar.changeDirection(p.direction);
        remoteAvatar.walk();
        // Arrêter l'animation de marche après 250 ms sans nouveau paquet
        clearTimeout(this.walkTimers.get(p.userId));
        this.walkTimers.set(p.userId, setTimeout(() => {
          this.gc?.getAvatar(p.userId)?.stopWalk();
        }, 250));
      }),

      // Bulle de dialogue distante (AVATAR_SAY)
      this.socket.remoteSay$.subscribe((p) => {
        this.gc?.getAvatar(p.userId)?.say(p.text, 2500);
      }),

      // Bulle de dialogue depuis le chat (CHAT_MESSAGE → tous les avatars)
      this.socket.chatMessage$.subscribe((p) => {
        this.gc?.getAvatar(p.userId)?.say(p.text, 2500);
      }),
    );

    // ── Interpolation lerp pour les avatars distants ─────────────────────────
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

    // ── Mode édition initial ──────────────────────────────────────────────────
    if (this.editMode) this.gc.setEditMode(true);
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

