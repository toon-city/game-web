import { Component, inject, signal, computed } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { SocketService } from '../../../core/services/socket.service';
import { AuthService } from '../../../core/services/auth.service';
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

  fillPercent = computed(() => {
    const max = this.socket.roomState()?.users?.length ?? 1;
    return Math.min(100, Math.round((this.totalConnected() / Math.max(1, max)) * 100));
  });
}
