import { Component, EventEmitter, Output, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { Observable } from 'rxjs';
import { FriendsStatus } from '@toon-live/game-types';
import { AuthService } from '../../../core/services/auth.service';
import { FriendService } from '../../../core/services/friend.service';
import { UserListItem } from '../../../core/services/user-list.service';
import { DialogStackService } from '../../../core/services/dialog-stack.service';
import { AvatarBadgeComponent } from '../avatar-badge/avatar-badge.component';

type FriendsTab = 'friends' | 'requests' | 'search' | 'blocked';

@Component({
  selector: 'app-friends',
  standalone: true,
  imports: [FormsModule, DragDropModule, AvatarBadgeComponent],
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.scss'],
})
export class FriendsComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  private readonly auth = inject(AuthService);
  private readonly friendService = inject(FriendService);
  private readonly dialogStack = inject(DialogStackService);

  /** Bumped on open and on every drag — "dernier affiché + dernier déplacé". */
  zIndex = signal(100);

  readonly myId = () => this.auth.user()?.id ?? '';

  activeTab = signal<FriendsTab>('friends');
  status = signal<FriendsStatus | null>(null);

  searchQuery = '';
  searchResults = signal<UserListItem[]>([]);
  searching = signal(false);

  busy = signal(false);
  errorText = signal<string | null>(null);
  infoText = signal<string | null>(null);

  ngOnInit(): void {
    this.zIndex.set(this.dialogStack.bringToFront());
    this.refreshStatus();
  }

  onDragStarted(): void {
    this.zIndex.set(this.dialogStack.bringToFront());
  }

  selectTab(tab: FriendsTab): void {
    this.activeTab.set(tab);
    this.errorText.set(null);
    this.infoText.set(null);
  }

  isFriend(userId: string): boolean {
    return this.status()?.friends.some(f => f.userId === userId) ?? false;
  }

  isBlocked(userId: string): boolean {
    return this.status()?.blocked.some(b => b.userId === userId) ?? false;
  }

  hasSentRequest(userId: string): boolean {
    return this.status()?.sentRequests.some(r => r.otherUserId === userId) ?? false;
  }

  /** For AvatarBadgeComponent's [override] — same convention as mairie/just-married. */
  avatarOverride(entry: { skinColor: number | null; clothing: Record<string, string> }): { skinColor: number; clothing: Record<string, string> } {
    return { skinColor: entry.skinColor ?? 0xf7ceaf, clothing: entry.clothing };
  }

  search(): void {
    const q = this.searchQuery.trim();
    if (!q) { this.searchResults.set([]); return; }
    this.searching.set(true);
    this.friendService.search(q).subscribe({
      next: (page) => {
        this.searching.set(false);
        this.searchResults.set(page.content.filter(u => u.id !== this.myId()));
      },
      error: () => { this.searching.set(false); this.searchResults.set([]); },
    });
  }

  sendRequest(userId: string): void {
    this.run(this.friendService.sendRequest(userId), 'Demande envoyée.');
  }

  accept(requestId: number): void {
    this.run(this.friendService.accept(requestId), null);
  }

  decline(requestId: number): void {
    this.run(this.friendService.decline(requestId), null);
  }

  cancelRequest(requestId: number): void {
    this.run(this.friendService.cancel(requestId), null);
  }

  removeFriend(userId: string): void {
    this.run(this.friendService.removeFriend(userId), null);
  }

  block(userId: string): void {
    this.run(this.friendService.block(userId), 'Toon bloqué.');
  }

  unblock(userId: string): void {
    this.run(this.friendService.unblock(userId), null);
  }

  private run(action: Observable<void>, successMsg: string | null): void {
    this.busy.set(true);
    this.errorText.set(null);
    action.subscribe({
      next: () => {
        this.busy.set(false);
        if (successMsg) this.infoText.set(successMsg);
        this.refreshStatus();
      },
      error: (err) => {
        this.busy.set(false);
        this.errorText.set(err?.error?.message ?? 'Échec de l\'action.');
      },
    });
  }

  private refreshStatus(): void {
    this.friendService.status().subscribe({
      next: (s) => this.status.set(s),
      error: () => this.errorText.set('Impossible de charger vos amis.'),
    });
  }
}
