import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormsModule } from '@angular/forms';
import { RoomPermission } from '@toon-live/game-types';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';
import { SocketService } from '../../core/services/socket.service';
import { GameCanvasComponent } from './components/game-canvas/game-canvas.component';
import { ChatComponent } from './components/chat/chat.component';
import { UserListComponent } from './components/user-list/user-list.component';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [
    MatToolbarModule, MatIconModule, MatButtonModule, MatTooltipModule,
    MatSlideToggleModule, FormsModule,
    GameCanvasComponent, ChatComponent, UserListComponent,
  ],
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.scss'],
})
export class GameComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly auth = inject(AuthService);
  readonly socket = inject(SocketService);

  roomId = '';
  editMode = signal(false);

  readonly canEdit = computed(() => {
    const state = this.socket.roomState();
    return state ? state.yourPermission >= RoomPermission.EDIT : false;
  });

  readonly roomName = computed(() => this.socket.roomState()?.name ?? '…');

  readonly RoomPermission = RoomPermission;

  ngOnInit(): void {
    this.roomId = this.route.snapshot.paramMap.get('roomId') ?? '';
    this.socket.connect(environment.wsUrl || window.location.origin);
    // Wait for connection then join
    const check = setInterval(() => {
      if (this.socket.isConnected()) {
        clearInterval(check);
        this.socket.joinRoom(this.roomId);
      }
    }, 100);
  }

  leave(): void {
    this.socket.leaveRoom(this.roomId);
    this.socket.disconnect();
    this.router.navigate(['/lobby']);
  }

  ngOnDestroy(): void {
    this.socket.leaveRoom(this.roomId);
    this.socket.disconnect();
  }
}
