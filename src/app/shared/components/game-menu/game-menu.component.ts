import { Component, inject, signal, computed } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { SocketService } from '../../../core/services/socket.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserActionDialogService } from '../../../core/services/user-action-dialog.service';
import { ProfileService } from '../../../core/services/profile.service';
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
  private profileService = inject(ProfileService);

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
   * Own row: no MP/ban dialog to show (you can't message or moderate
   * yourself) — was previously a dead click for the local player, which
   * looks like a bug when testing solo since it's the only row shown.
   * Opens the profile preview instead. Other rows: unchanged, the
   * mp/kick/ban dialog (it has its own "Voir le profil" button).
   */
  openRow(user: RoomUser): void {
    if (user.userId === this.myUserId()) {
      this.profileService.open(user.userId);
      return;
    }
    this.userActionDialog.open(user);
  }

  fillPercent = computed(() => {
    const max = this.socket.roomState()?.users?.length ?? 1;
    return Math.min(100, Math.round((this.totalConnected() / Math.max(1, max)) * 100));
  });
}
