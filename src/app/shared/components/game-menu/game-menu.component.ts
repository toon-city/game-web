import { Component, inject, signal, computed } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { SocketService } from '../../../core/services/socket.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserActionDialogService } from '../../../core/services/user-action-dialog.service';
import { RoomUser } from '@toon-live/game-types';

@Component({
  selector: 'app-game-menu',
  standalone: true,
  imports: [DragDropModule],
  templateUrl: './game-menu.component.html',
  styleUrls: ['./game-menu.component.scss'],
})
export class GameMenuComponent {
  private socket = inject(SocketService);
  private auth = inject(AuthService);
  private userActionDialog = inject(UserActionDialogService);

  readonly users = computed<RoomUser[]>(() => this.socket.roomState()?.users ?? []);
  readonly totalConnected = computed(() => this.users().length);
  readonly myUserId = computed(() => this.auth.user()?.id ?? '');

  readonly emojis = Array.from({ length: 12 }, (_, i) => i + 1);

  soundOn = signal(true);
  menuOpen = signal(true);

  toggleMenu(): void { this.menuOpen.update(v => !v); }

  genderClass(gender: string | null | undefined): string {
    switch (gender) {
      case 'MALE':       return 'man';
      case 'FEMALE':     return 'woman';
      case 'NON_BINARY': return 'no-binary';
      default:           return 'man'; // fallback
    }
  }

  /**
   * Opens the same "aperçu" dialog for every row, self included — same
   * precedent as clicking your own avatar in-canvas (GameCanvasComponent's
   * 'avatar:click' handler, no self-exception either). The dialog itself
   * already hides the friend/block/room/site-ban actions on self
   * (isSelf() checks) and exposes "Voir le profil" for the full page.
   */
  openRow(user: RoomUser): void {
    this.userActionDialog.open(user);
  }

  /**
   * All three just broadcast — the server echoes back to the sender too
   * (same pattern as chat), so the local avatar's own bubble appears via
   * that round-trip in GameCanvasComponent's remoteEmote$ subscription,
   * not from anything done here.
   */
  sendSmile(frame: number): void {
    const roomId = this.socket.roomState()?.roomId;
    if (roomId) this.socket.sendAvatarEmote(roomId, 'SMILE', frame);
  }

  sendLove(): void {
    const roomId = this.socket.roomState()?.roomId;
    if (roomId) this.socket.sendAvatarEmote(roomId, 'LOVE');
  }

  sendZzz(): void {
    const roomId = this.socket.roomState()?.roomId;
    if (roomId) this.socket.sendAvatarEmote(roomId, 'ZZZ');
  }
}
