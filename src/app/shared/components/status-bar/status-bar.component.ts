import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { StatsService } from '../../../core/services/stats.service';
import { DeditoonService } from '../../../core/services/deditoon.service';
import { UserListService, UserListItem } from '../../../core/services/user-list.service';

/** Ligne dans le tableau joueurs : données API + roomId formaté en string */
export interface PlayerRow extends UserListItem {
  roomId: string | null;
}

@Component({
  selector: 'app-status-bar',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './status-bar.component.html',
  styleUrls: ['./status-bar.component.scss'],
})
export class StatusBarComponent implements OnInit, OnDestroy {
  readonly auth         = inject(AuthService);
  readonly statsService = inject(StatsService);
  readonly deditoonService = inject(DeditoonService);
  readonly userListService = inject(UserListService);
  private readonly router       = inject(Router);

  // ── État déditoon ──────────────────────────────────────────────────────────
  playerPanelOpen   = signal(false);
  deditoonInputOpen = signal(false);
  deditoonText      = '';
  submitError       = signal<string | null>(null);
  submitting        = signal(false);

  // ── Ticker ─────────────────────────────────────────────────────────────────
  readonly deditoons = computed(() => {
    return this.deditoonService.deditoons();
  });

  // ── Panel joueurs ──────────────────────────────────────────────────────────
  playerSearch = '';
  private searchDebounce?: ReturnType<typeof setTimeout>;
  readonly PAGE_SIZE = 15;

  /** Lignes affichées = données API (online + currentRoomId inclus côté serveur) */
  readonly playerRows = computed<PlayerRow[]>(() => {
    const page = this.userListService.page();
    if (!page) return [];
    return page.content.map(u => ({
      ...u,
      roomId: u.currentRoomId == null ? null : String(u.currentRoomId),
    }));
    // Tri déjà fait côté back : online DESC, lastLoginAt DESC, username ASC
  });

  readonly currentPage = computed(() => this.userListService.page()?.number ?? 0);
  readonly totalPages  = computed(() => this.userListService.page()?.totalPages ?? 0);
  readonly totalUsers  = computed(() => this.userListService.page()?.totalElements ?? 0);

  // ── Intervals ──────────────────────────────────────────────────────────────
  private statsInterval?: ReturnType<typeof setInterval>;
  private deditoonInterval?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.statsService.refresh();
    this.deditoonService.refresh();
    this.statsInterval    = setInterval(() => this.statsService.refresh(), 30_000);
    this.deditoonInterval = setInterval(() => this.deditoonService.refresh(), 60_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.statsInterval);
    clearInterval(this.deditoonInterval);
    clearTimeout(this.searchDebounce);
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  togglePlayerPanel(): void {
    const next = !this.playerPanelOpen();
    this.playerPanelOpen.set(next);
    if (next) {
      this.userListService.load('', 0, this.PAGE_SIZE);
    }
  }

  onSearchChange(): void {
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      this.userListService.load(this.playerSearch, 0, this.PAGE_SIZE);
    }, 300);
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages()) return;
    this.userListService.load(this.playerSearch, page, this.PAGE_SIZE);
  }

  joinRoom(roomId: string): void {
    this.playerPanelOpen.set(false);
    this.router.navigate(['/room', roomId]);
  }

  openDeditoonInput(): void {
    this.deditoonText = '';
    this.submitError.set(null);
    this.deditoonInputOpen.set(true);
  }

  cancelDeditoon(): void {
    this.deditoonInputOpen.set(false);
  }

  submitDeditoon(): void {
    const msg = this.deditoonText.trim();
    if (!msg) return;
    this.submitting.set(true);
    this.submitError.set(null);
    this.deditoonService.post(msg).subscribe({
      next: (created) => {
        // Ajout optimiste immédiat + refresh serveur
        this.deditoonService.prepend(created);
        this.deditoonInputOpen.set(false);
        this.submitting.set(false);
        this.deditoonText = '';
        // Sync kreds depuis le serveur
        this.auth.refreshUser();
        // Sync liste depuis le serveur (au cas où d'autres ont posté)
        setTimeout(() => this.deditoonService.refresh(), 500);
      },
      error: (err) => {
        const detail = err?.error?.message ?? "Erreur lors de l'envoi.";
        this.submitError.set(detail);
        this.submitting.set(false);
      },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  genderClass(gender: string | null): string {
    if (gender === 'MALE')   return 'man';
    if (gender === 'FEMALE') return 'woman';
    return 'no-binary';
  }

  rankLabel(rank: number): string {
    if (rank >= 2) return 'admin';
    if (rank === 1) return 'modo';
    return '';
  }

  formatLastLogin(iso: string | null): string {
    if (!iso) return 'Jamais';
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 2)  return "à l'instant";
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)   return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7)     return `il y a ${days}j`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5)    return `il y a ${weeks} sem.`;
    const months = Math.floor(days / 30);
    return `il y a ${months} mois`;
  }

  paginationPages(): number[] {
    const total = this.totalPages();
    const cur   = this.currentPage();
    const pages: number[] = [];
    const start = Math.max(0, cur - 2);
    const end   = Math.min(total - 1, cur + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }
}
