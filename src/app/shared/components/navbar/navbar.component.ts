import { Component, EventEmitter, OnDestroy, OnInit, Output, inject, signal } from '@angular/core';
import { MairieService } from '../../../core/services/mairie.service';
import { FriendService } from '../../../core/services/friend.service';
import { TradeService } from '../../../core/services/trade.service';

const MAIRIE_POLL_MS = 20_000;
const FRIENDS_POLL_MS = 20_000;

@Component({
  selector: 'app-navbar',
  standalone: true,
  template: `
    <nav class="navbar" aria-label="Navigation principale">
      <img src="assets/images/navbar/accueil.png" alt="Accueil" class="nav-icon" (click)="accueil.emit()" role="button" tabindex="0" />
      <img src="assets/images/navbar/navigator.png" alt="Navigateur" class="nav-icon" (click)="navigateur.emit()" role="button" tabindex="0" />
      <img id="nav-inventory-icon" src="assets/images/navbar/inventory.png" alt="Inventaire" class="nav-icon" (click)="inventaire.emit()" role="button" tabindex="0" />
      <img src="assets/images/navbar/shop.png" alt="Boutique" class="nav-icon" (click)="boutique.emit()" role="button" tabindex="0" />
      <button class="nav-btn mairie-btn" (click)="onMairieClick()" type="button">
        Mairie
        @if (pendingReceived() > 0) {
          <span class="badge">{{ pendingReceived() > 9 ? '9+' : pendingReceived() }}</span>
        }
      </button>
      <button class="nav-btn mairie-btn" (click)="onAmisClick()" type="button">
        Amis
        @if (pendingFriendRequests() > 0) {
          <span class="badge">{{ pendingFriendRequests() > 9 ? '9+' : pendingFriendRequests() }}</span>
        } @else if (onlineFriendsCount() > 0) {
          <span class="badge badge-green">{{ onlineFriendsCount() > 9 ? '9+' : onlineFriendsCount() }}</span>
        }
      </button>
      <button class="nav-btn mairie-btn" (click)="tradeService.openPanel()" type="button">
        Échanges
      </button>
    </nav>
  `,
  styles: [`
    /* Palette/type are the real project identity (see login.component.scss /
       styles.scss's --toon-* tokens) — same recipe as the other shared panels. */
    :host { display: contents; }

    .navbar {
      position: fixed;
      right: 16px;
      bottom: 16px;
      display: flex;
      padding: 8px;
      gap: 8px;
      background: rgba(255, 255, 255, 0.97);
      border-radius: 999px;
      z-index: 150;
      align-items: center;
      box-shadow: 0 8px 24px rgba(3, 56, 73, 0.28);
    }

    .nav-icon {
      height: 36px;
      width: 36px;
      object-fit: contain;
      cursor: pointer;
      border-radius: 50%;
      padding: 4px;
      box-sizing: border-box;
      transition: transform 0.15s, background 0.15s;

      &:hover { transform: scale(1.1); background: rgba(35, 105, 129, 0.08); }
    }

    .nav-btn {
      position: relative;
      padding: 8px 16px;
      border: none;
      border-radius: 999px;
      background: rgba(35, 105, 129, 0.07);
      color: var(--toon-petrol-dark);
      font-weight: 800;
      font-size: 13px;
      font-family: 'Nunito', sans-serif;
      cursor: pointer;
      transition: background 0.12s, transform 0.12s;

      &:hover { background: rgba(240, 3, 127, 0.10); color: var(--toon-pink-dark); transform: translateY(-1px); }
      &:focus { outline: none; box-shadow: 0 0 0 3px rgba(35, 105, 129, 0.15); }
    }

    .mairie-btn { overflow: visible; }

    .badge {
      position: absolute;
      top: -6px;
      right: -6px;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--toon-pink), var(--toon-pink-dark));
      color: white;
      font-size: 10px;
      font-weight: 800;
      line-height: 18px;
      text-align: center;
      box-shadow: 0 0 0 2px white, 0 2px 6px rgba(240, 3, 127, 0.5);
    }

    .badge-green {
      background: linear-gradient(90deg, #22c55e, #16a34a);
      box-shadow: 0 0 0 2px white, 0 2px 6px rgba(22, 163, 74, 0.5);
    }
  `],
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
