import { Component, EventEmitter, OnDestroy, OnInit, Output, inject, signal } from '@angular/core';
import { MairieService } from '../../../core/services/mairie.service';

const MAIRIE_POLL_MS = 20_000;

@Component({
  selector: 'app-navbar',
  standalone: true,
  template: `
    <nav class="navbar" aria-label="Navigation principale">
      <img src="assets/images/navbar/accueil.png" alt="Accueil" class="nav-icon" (click)="accueil.emit()" role="button" tabindex="0" />
      <img src="assets/images/navbar/navigator.png" alt="Navigateur" class="nav-icon" (click)="navigateur.emit()" role="button" tabindex="0" />
      <img src="assets/images/navbar/inventory.png" alt="Inventaire" class="nav-icon" (click)="inventaire.emit()" role="button" tabindex="0" />
      <img src="assets/images/navbar/shop.png" alt="Boutique" class="nav-icon" (click)="boutique.emit()" role="button" tabindex="0" />
      <button class="nav-btn mairie-btn" (click)="onMairieClick()" type="button">
        Mairie
        @if (pendingReceived() > 0) {
          <span class="badge">{{ pendingReceived() > 9 ? '9+' : pendingReceived() }}</span>
        }
      </button>
    </nav>
  `,
  styles: [`
    :host { display: contents; }

    .navbar {
      position: fixed;
      right: 16px;
      bottom: 16px;
      display: flex;
      padding: 10px;
      gap: 8px;
      background: white;
      border: 2px solid #2b4a5a;
      border-radius: 11px;
      z-index: 150;
      align-items: center;
      box-shadow: 0 6px 20px rgba(0,0,0,0.15);
    }

    .nav-icon {
      height: 36px;
      width: auto;
      cursor: pointer;
      border-radius: 4px;
      transition: transform 0.15s;

      &:hover { transform: scale(1.1); }
    }

    .nav-btn {
      position: relative;
      padding: 6px 14px;
      border: 2px solid #2b4a5a;
      border-radius: 8px;
      background: #fff;
      color: #2b4a5a;
      font-weight: 700;
      font-size: 13px;
      font-family: 'Nunito', sans-serif;
      cursor: pointer;

      &:hover { background: #e8f4f8; }
      &:focus { outline: none; box-shadow: 0 0 0 3px rgba(43, 74, 90, 0.12); }
    }

    .mairie-btn { overflow: visible; }

    .badge {
      position: absolute;
      top: -7px;
      right: -7px;
      min-width: 17px;
      height: 17px;
      padding: 0 3px;
      border-radius: 999px;
      background: #EC038D;
      color: white;
      font-size: 10px;
      font-weight: 800;
      line-height: 17px;
      text-align: center;
      box-shadow: 0 0 0 2px white;
    }
  `],
})
export class NavbarComponent implements OnInit, OnDestroy {
  @Output() accueil = new EventEmitter<void>();
  @Output() navigateur = new EventEmitter<void>();
  @Output() inventaire = new EventEmitter<void>();
  @Output() boutique = new EventEmitter<void>();
  @Output() mairie = new EventEmitter<void>();

  private readonly mairieService = inject(MairieService);

  /** Self-polled, not passed in — the badge must stay current even while the
   *  Mairie panel itself is closed, same reasoning as StatusBarComponent's
   *  own independent polling for the online-count. */
  pendingReceived = signal(0);
  private pollInterval?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.refreshPending();
    this.pollInterval = setInterval(() => this.refreshPending(), MAIRIE_POLL_MS);
  }

  ngOnDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  onMairieClick(): void {
    this.mairie.emit();
    // Opening the panel is the natural moment the count goes stale (the
    // user is about to act on those requests) — refresh right after.
    this.refreshPending();
  }

  private refreshPending(): void {
    this.mairieService.status().subscribe({
      next: (s) => this.pendingReceived.set(s.receivedProposals.length),
      error: () => {},
    });
  }
}
