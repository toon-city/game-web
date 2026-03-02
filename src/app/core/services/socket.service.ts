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
  readonly userJoined$ = new Subject<UserJoinedPayload>();
  readonly userLeft$ = new Subject<UserLeftPayload>();
  readonly remoteMove$ = new Subject<RemoteAvatarMovePayload>();
  readonly remoteSay$ = new Subject<RemoteAvatarSayPayload>();
  readonly chatMessage$ = new Subject<RemoteChatMessagePayload>();
  readonly furniturePlace$ = new Subject<RemoteFurniturePlacePayload>();
  readonly furnitureMove$ = new Subject<RemoteFurnitureMovePayload>();
  readonly furnitureRotate$ = new Subject<RemoteFurnitureRotatePayload>();
  readonly furnitureRemove$ = new Subject<RemoteFurnitureRemovePayload>();

  constructor(private auth: AuthService) {}

  connect(serverUrl: string): void {
    const token = this.auth.token();
    if (!token) return;

    this.gs = new GameSocket({ serverUrl, token, moveThrottleMs: 50 });

    this.unsubs = [
      this.gs.on('connected', () => this.isConnected.set(true)),
      this.gs.on('disconnected', () => this.isConnected.set(false)),
      this.gs.on('roomState', (s) => this.roomState.set(s)),
      this.gs.on('roomError', (e) => this.roomError$.next(e)),
      this.gs.on('userJoined', (p) => this.userJoined$.next(p)),
      this.gs.on('userLeft', (p) => this.userLeft$.next(p)),
      this.gs.on('remoteAvatarMove', (p) => this.remoteMove$.next(p)),
      this.gs.on('remoteAvatarSay', (p) => this.remoteSay$.next(p)),
      this.gs.on('remoteChatMessage', (p) => this.chatMessage$.next(p)),
      this.gs.on('remoteFurniturePlace', (p) => this.furniturePlace$.next(p)),
      this.gs.on('remoteFurnitureMove', (p) => this.furnitureMove$.next(p)),
      this.gs.on('remoteFurnitureRotate', (p) => this.furnitureRotate$.next(p)),
      this.gs.on('remoteFurnitureRemove', (p) => this.furnitureRemove$.next(p)),
    ];

    this.gs.connect();
  }

  disconnect(): void {
    this.unsubs.forEach((fn) => fn());
    this.unsubs = [];
    this.gs?.disconnect();
    this.gs = null;
    this.isConnected.set(false);
  }

  // ── Delegating helpers ───────────────────────────────────────────────────────

  joinRoom(roomId: string): void { this.gs?.joinRoom(roomId); }
  leaveRoom(roomId: string): void { this.gs?.leaveRoom(roomId); }

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
