import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';
import { RoomPermission } from '@toon-live/game-types';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';
import { SocketService } from '../../core/services/socket.service';
import { GameCanvasComponent } from './components/game-canvas/game-canvas.component';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [FormsModule, MatSlideToggleModule, MatSnackBarModule, GameCanvasComponent],
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.scss'],
})
export class GameComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  readonly auth = inject(AuthService);
  readonly socket = inject(SocketService);

  roomId = '';
  editMode = signal(false);
  /** Contrôle la destruction/recréation du GameCanvasComponent lors d'un changement de room. */
  canShowCanvas = signal(false);
  private kickedSub?: Subscription;
  private paramSub?: Subscription;
  private connectionLostSub?: Subscription;
  /** Empêche joinWhenReady de boucler après destruction du composant ou perte de connexion. */
  private _joinActive = false;

  readonly canEdit = computed(() => {
    const state = this.socket.roomState();
    return state ? state.yourPermission >= RoomPermission.EDIT : false;
  });

  readonly roomName = computed(() => this.socket.roomState()?.name ?? '…');

  readonly RoomPermission = RoomPermission;

  ngOnInit(): void {
    this.socket.connect(environment.wsUrl || window.location.origin);

    this.kickedSub = this.socket.kicked$.subscribe((message) => {
      this.snack.open(message, 'OK', { duration: 5000, panelClass: 'snack-error' });
      this.router.navigate(['/lobby']);
    });

    this.connectionLostSub = this.socket.connectionLost$.subscribe(() => {
      this._joinActive = false;
      this.canShowCanvas.set(false);
      this.socket.disconnect();
      this.snack.open('La connexion avec le serveur de jeu a été perdue.', 'OK', {
        duration: 6000,
        panelClass: 'snack-error',
      });
      this.router.navigate(['/lobby']);
    });

    // Subscribe to param changes to handle both initial load and room-to-room navigation.
    // When Angular reuses this component (same route pattern, different roomId),
    // ngOnInit is NOT called again — only paramMap emits.
    this.paramSub = this.route.paramMap.subscribe(params => {
      const newRoomId = params.get('roomId') ?? '';

      if (this.roomId && this.roomId !== newRoomId) {
        // Quitter l'ancienne room, vider le roomState et destruction du canvas.
        this.socket.leaveRoom(this.roomId);
        this.socket.clearRoomState();
        this.canShowCanvas.set(false);

        // Laisser Angular détruire le canvas (un tick), puis recréer avec la nouvelle room.
        setTimeout(() => {
          this.roomId = newRoomId;
          this.canShowCanvas.set(true);
          this.joinWhenReady();
        }, 0);
      } else {
        // Premier chargement.
        this.roomId = newRoomId;
        this.canShowCanvas.set(true);
        this.joinWhenReady();
      }
    });
  }

  private joinWhenReady(): void {
    this._joinActive = true;
    this._tryJoin();
  }

  private _tryJoin(): void {
    if (!this._joinActive) return;
    if (this.socket.isConnected()) {
      this.socket.joinRoom(this.roomId);
      this._joinActive = false;
    } else {
      setTimeout(() => this._tryJoin(), 100);
    }
  }

  leave(): void {
    this.socket.leaveRoom(this.roomId);
    this.socket.disconnect();
    this.router.navigate(['/lobby']);
  }

  ngOnDestroy(): void {
    this._joinActive = false;
    this.kickedSub?.unsubscribe();
    this.paramSub?.unsubscribe();
    this.connectionLostSub?.unsubscribe();
    this.socket.leaveRoom(this.roomId);
    this.socket.disconnect();
  }
}
