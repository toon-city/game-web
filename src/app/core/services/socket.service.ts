import { Injectable, OnDestroy, signal } from '@angular/core';
import { GameSocket } from '@toon-live/game-socket';
import {
  RoomState,
  RoomErrorPayload,
  UserJoinedPayload,
  UserLeftPayload,
  RemoteAvatarMovePayload,
  RemoteAvatarSayPayload,
  RemoteChatMessagePayload,
  RemoteFurnitureMovePayload,
  RemoteFurniturePlacePayload,
  RemoteFurnitureRemovePayload,
  RemoteFurnitureRotatePayload,
  AvatarAppearancePayload,
  FurniturePlacePayload,
  FurnitureMovePayload,
  FurnitureRotatePayload,
  FurnitureRemovePayload,
} from '@toon-live/game-types';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private gs: GameSocket | null = null;
  private unsubs: Array<() => void> = [];

  /** Signals + subjects exposed to components */
  readonly isConnected = signal(false);
  readonly roomState = signal<RoomState | null>(null);
  readonly roomError$ = new Subject<RoomErrorPayload>();
  readonly kicked$ = new Subject<string>();
  /** Émis lorsque la connexion est perdue de manière inattendue (serveur injoignable, coupure réseau…). */
  readonly connectionLost$ = new Subject<void>();

  /** Positionné à true avant un disconnect volontaire pour ne pas déclencher connectionLost$. */
  private _intentionalDisconnect = false;
  /** Garantit qu'un seul événement connectionLost$ est émis par session de connexion. */
  private _connectionLostEmitted = false;
  readonly userJoined$ = new Subject<UserJoinedPayload>();
  readonly userLeft$ = new Subject<UserLeftPayload>();
  readonly remoteMove$ = new Subject<RemoteAvatarMovePayload>();
  readonly remoteSay$ = new Subject<RemoteAvatarSayPayload>();
  readonly chatMessage$ = new Subject<RemoteChatMessagePayload>();
  readonly avatarAppearance$ = new Subject<AvatarAppearancePayload>();
  readonly furniturePlace$ = new Subject<RemoteFurniturePlacePayload>();
  readonly furnitureMove$ = new Subject<RemoteFurnitureMovePayload>();
  readonly furnitureRotate$ = new Subject<RemoteFurnitureRotatePayload>();
  readonly furnitureRemove$ = new Subject<RemoteFurnitureRemovePayload>();

  constructor(private auth: AuthService) {}

  connect(serverUrl: string): void {
    if (!this.auth.token()) return;

    this._intentionalDisconnect = false;
    this._connectionLostEmitted = false;
    this.roomState.set(null);
    this.gs = new GameSocket({ serverUrl, token: () => this.auth.token() ?? '', moveThrottleMs: 50 });

    this.unsubs = [
      this.gs.on('connected', () => this.isConnected.set(true)),
      this.gs.on('disconnected', () => {
        this.isConnected.set(false);
        if (!this._intentionalDisconnect && !this._connectionLostEmitted) {
          this._connectionLostEmitted = true;
          this.connectionLost$.next();
        }
      }),
      this.gs.on('roomState', (s) => this.roomState.set(s)),
      this.gs.on('roomError', (e) => {
        this.roomError$.next(e);
        if (e.code === 'INVALID_TOKEN') {
          this.auth.logout();
        }
      }),
      this.gs.on('kicked', (message) => {
        this.kicked$.next(message);
        this.disconnect();
      }),
      this.gs.on('userJoined', (p) => {
        this.userJoined$.next(p);
        // Maintain the live users list inside roomState
        this.roomState.update(state => {
          if (!state) return state;
          const already = state.users.some(u => u.userId === p.userId);
          if (already) return state;
          return {
            ...state,
            users: [...state.users, {
              userId: p.userId,
              username: p.username,
              skinColor: p.skinColor,
              clothing: p.clothing,
              x: p.x,
              y: p.y,
              direction: p.direction,
              gender: p.gender,
              rank: p.rank,
              toonizLevel: p.toonizLevel,
            }],
          };
        });
      }),
      this.gs.on('userLeft', (p) => {
        this.userLeft$.next(p);
        this.roomState.update(state => {
          if (!state) return state;
          return { ...state, users: state.users.filter(u => u.userId !== p.userId) };
        });
      }),
      this.gs.on('remoteAvatarMove', (p) => this.remoteMove$.next(p)),
      this.gs.on('remoteAvatarSay', (p) => this.remoteSay$.next(p)),
      this.gs.on('remoteChatMessage', (p) => this.chatMessage$.next(p)),
      this.gs.on('avatarAppearance', (p) => this.avatarAppearance$.next(p)),
      this.gs.on('remoteFurniturePlace', (p) => this.furniturePlace$.next(p)),
      this.gs.on('remoteFurnitureMove', (p) => this.furnitureMove$.next(p)),
      this.gs.on('remoteFurnitureRotate', (p) => this.furnitureRotate$.next(p)),
      this.gs.on('remoteFurnitureRemove', (p) => this.furnitureRemove$.next(p)),
    ];

    this.gs.connect();
  }

  disconnect(): void {
    this._intentionalDisconnect = true;
    this.unsubs.forEach((fn) => fn());
    this.unsubs = [];
    this.gs?.disconnect();
    this.gs = null;
    this.isConnected.set(false);
    this.roomState.set(null);
  }

  /** Vide le roomState pour forcer le canvas à attendre le nouvel état lors d'un changement de room. */
  clearRoomState(): void {
    this.roomState.set(null);
  }

  // ── Delegating helpers ───────────────────────────────────────────────────────

  joinRoom(roomId: string): void {
    this.gs?.joinRoom(roomId, 1);
  }
  leaveRoom(roomId: string): void { this.gs?.leaveRoom(roomId); }

  clothingRefresh(roomId: string): void {
    this.gs?.sendClothingRefresh(roomId);
  }

  sendAvatarMove(roomId: string, x: number, y: number, direction: number): void {
    this.gs?.sendAvatarMove(roomId, x, y, direction);
  }
  sendAvatarSay(roomId: string, text: string): void {
    this.gs?.sendAvatarSay(roomId, text);
  }
  sendChatMessage(roomId: string, text: string): void {
    this.gs?.sendChatMessage(roomId, text);
  }
  sendFurniturePlace(roomId: string, p: FurniturePlacePayload): void {
    this.gs?.sendFurniturePlace(roomId, p);
  }
  sendFurnitureMove(roomId: string, p: FurnitureMovePayload): void {
    this.gs?.sendFurnitureMove(roomId, p);
  }
  sendFurnitureRotate(roomId: string, p: FurnitureRotatePayload): void {
    this.gs?.sendFurnitureRotate(roomId, p);
  }
  sendFurnitureRemove(roomId: string, p: FurnitureRemovePayload): void {
    this.gs?.sendFurnitureRemove(roomId, p);
  }

  ngOnDestroy(): void { this.disconnect(); }
}
