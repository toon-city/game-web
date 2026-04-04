import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { NgFor } from '@angular/common';
import { RoomUser } from '@toon-live/game-types';
import { SocketService } from '../../../../core/services/socket.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [MatListModule, MatIconModule, NgFor],
  templateUrl: './user-list.component.html',
  styleUrls: ['./user-list.component.scss'],
})
export class UserListComponent implements OnInit, OnDestroy {
  @Input() roomId = '';

  private socket = inject(SocketService);
  private auth = inject(AuthService);
  private subs: Subscription[] = [];

  users = signal<RoomUser[]>([]);

  readonly myUserId = computed(() => this.auth.user()?.id ?? '');

  ngOnInit(): void {
    // Initialise from room state
    const state = this.socket.roomState();
    if (state) this.users.set(state.users);

    this.subs.push(
      this.socket.userJoined$.subscribe((p) => {
        this.users.update((list) => [
          ...list.filter((u) => u.userId !== p.userId),
          { userId: p.userId, username: p.username, skinColor: p.skinColor, clothing: p.clothing, direction: p.direction, x: p.x, y: p.y, gender: p.gender, rank: p.rank, toonizLevel: p.toonizLevel },
        ]);
      }),
      this.socket.userLeft$.subscribe((p) => {
        this.users.update((list) => list.filter((u) => u.userId !== p.userId));
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }
}
