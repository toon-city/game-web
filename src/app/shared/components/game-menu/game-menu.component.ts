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

  /** Row click — aperçu de profil, pour tout le monde y compris soi-même. */
  openProfile(user: RoomUser): void {
    this.profileService.open(user.userId);
  }

  /** "⋮" icon click — MP/kick/ban, séparé du profil pour ne pas cacher les
   *  actions de modération derrière un clic sur "Voir le profil". */
  openUserAction(user: RoomUser, ev: Event): void {
    ev.stopPropagation();
    if (user.userId === this.myUserId()) return;
    this.userActionDialog.open(user);
  }

  fillPercent = computed(() => {
    const max = this.socket.roomState()?.users?.length ?? 1;
    return Math.min(100, Math.round((this.totalConnected() / Math.max(1, max)) * 100));
  });
}
