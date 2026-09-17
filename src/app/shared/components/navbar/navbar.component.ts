import { Component, EventEmitter, OnDestroy, OnInit, Output, inject, signal } from '@angular/core';
import { MairieService } from '../../../core/services/mairie.service';
import { FriendService } from '../../../core/services/friend.service';
import { TradeService } from '../../../core/services/trade.service';

const MAIRIE_POLL_MS = 20_000;
const FRIENDS_POLL_MS = 20_000;

@Component({
  selector: 'app-navbar',
  standalone: true,
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
})
export class NavbarComponent implements OnInit, OnDestroy {
  @Output() accueil = new EventEmitter<void>();
  @Output() navigateur = new EventEmitter<void>();
  @Output() inventaire = new EventEmitter<void>();
  @Output() boutique = new EventEmitter<void>();
  @Output() mairie = new EventEmitter<void>();
  @Output() amis = new EventEmitter<void>();

  private readonly mairieService = inject(MairieService);
  private readonly friendService = inject(FriendService);
  readonly tradeService = inject(TradeService);

  /** Collapsible right-edge panel, same tab-and-slide recipe as GameMenuComponent. */
  open = signal(true);
  toggle(): void {
    this.open.update(v => !v);
  }

  /** Self-polled, not passed in — the badge must stay current even while the
   *  Mairie panel itself is closed, same reasoning as StatusBarComponent's
   *  own independent polling for the online-count. */
  pendingReceived = signal(0);
  pendingFriendRequests = signal(0);
  /** Only shown when there's no pending request — see the template's @if/@else if priority. */
  onlineFriendsCount = signal(0);
  private mairiePollInterval?: ReturnType<typeof setInterval>;
  private friendsPollInterval?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.refreshPending();
    this.refreshFriendsStatus();
    this.mairiePollInterval = setInterval(() => this.refreshPending(), MAIRIE_POLL_MS);
    this.friendsPollInterval = setInterval(() => this.refreshFriendsStatus(), FRIENDS_POLL_MS);
  }

  ngOnDestroy(): void {
    if (this.mairiePollInterval) clearInterval(this.mairiePollInterval);
    if (this.friendsPollInterval) clearInterval(this.friendsPollInterval);
  }

  onMairieClick(): void {
    this.mairie.emit();
    // Opening the panel is the natural moment the count goes stale (the
    // user is about to act on those requests) — refresh right after.
    this.refreshPending();
  }

  onAmisClick(): void {
    this.amis.emit();
    this.refreshFriendsStatus();
  }

  private refreshPending(): void {
    this.mairieService.status().subscribe({
      next: (s) => this.pendingReceived.set(s.receivedProposals.length),
      error: () => {},
    });
  }

  private refreshFriendsStatus(): void {
    this.friendService.status().subscribe({
      next: (s) => {
        this.pendingFriendRequests.set(s.receivedRequests.length);
        this.onlineFriendsCount.set(s.friends.filter(f => f.online).length);
      },
      error: () => {},
    });
  }
}
