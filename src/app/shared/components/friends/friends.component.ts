import { Component, EventEmitter, Output, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { FriendsStatus } from '@toon-live/game-types';
import { AuthService } from '../../../core/services/auth.service';
import { FriendService } from '../../../core/services/friend.service';
import { UserListItem } from '../../../core/services/user-list.service';
import { DialogStackService } from '../../../core/services/dialog-stack.service';
import { ProfileService } from '../../../core/services/profile.service';
import { AvatarBadgeComponent } from '../avatar-badge/avatar-badge.component';

type FriendsTab = 'friends' | 'requests' | 'search' | 'blocked';

const STATUS_POLL_MS = 20_000;

@Component({
  selector: 'app-friends',
  standalone: true,
  imports: [FormsModule, DragDropModule, AvatarBadgeComponent],
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.scss'],
})
export class FriendsComponent implements OnInit, OnDestroy {
  @Output() close = new EventEmitter<void>();

  private readonly auth = inject(AuthService);
  private readonly friendService = inject(FriendService);
  private readonly dialogStack = inject(DialogStackService);
  private readonly dialogId = this.dialogStack.newInstanceId();
  private readonly router = inject(Router);
  private readonly profileService = inject(ProfileService);

  /** Bumped on open and on every drag — "dernier affiché + dernier déplacé". */
  zIndex = signal(100);
  /** On-open position — see DialogStackService.open() for why this isn't a
   *  fixed value in the SCSS anymore. */
  pos = signal({ top: 80, left: 16 });

  readonly myId = () => this.auth.user()?.id ?? '';

  activeTab = signal<FriendsTab>('friends');
  status = signal<FriendsStatus | null>(null);

  searchQuery = '';
  searchResults = signal<UserListItem[]>([]);
  searching = signal(false);

  busy = signal(false);
  errorText = signal<string | null>(null);
  infoText = signal<string | null>(null);

  /** Keeps online status / "Rejoindre" eligibility current while the panel stays open — same interval as NavbarComponent's own badge polling. */
  private pollInterval?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    const p = this.dialogStack.open(this.dialogId, 80, 16, 380, 500);
    this.zIndex.set(p.zIndex);
    this.pos.set({ top: p.top, left: p.left });
    this.refreshStatus();
    this.pollInterval = setInterval(() => this.refreshStatus(), STATUS_POLL_MS);
  }

  ngOnDestroy(): void {
    this.dialogStack.release(this.dialogId);
    if (this.pollInterval) clearInterval(this.pollInterval);
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
    return { skinColor: entry.skinColor ?? 0xffffff, clothing: entry.clothing };
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

  joinRoom(roomId: number): void {
    this.close.emit();
    this.router.navigate(['/room', roomId]);
  }

  openProfile(userId: string): void {
    this.profileService.open(userId);
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
