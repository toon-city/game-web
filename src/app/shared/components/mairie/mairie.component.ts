import { Component, EventEmitter, Output, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UserItemInfo, MairieStatus } from '@toon-live/game-types';
import { AuthService } from '../../../core/services/auth.service';
import { MairieService } from '../../../core/services/mairie.service';
import { InventoryService } from '../../../core/services/inventory.service';
import { UserListItem } from '../../../core/services/user-list.service';

@Component({
  selector: 'app-mairie',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './mairie.component.html',
  styleUrls: ['./mairie.component.scss'],
})
export class MairieComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  private readonly auth = inject(AuthService);
  private readonly mairie = inject(MairieService);
  private readonly inventory = inject(InventoryService);

  readonly myId = computed(() => this.auth.user()?.id ?? '');

  status = signal<MairieStatus | null>(null);
  rings = signal<UserItemInfo[]>([]);

  searchQuery = '';
  searchResults = signal<UserListItem[]>([]);
  searching = signal(false);

  selectedTarget = signal<UserListItem | null>(null);
  selectedRingId: number | null = null;

  pezToConvert: number | null = null;

  busy = signal(false);
  errorText = signal<string | null>(null);
  infoText = signal<string | null>(null);

  readonly isMarried = computed(() => !!this.status()?.marriedToUsername);

  ngOnInit(): void {
    this.refreshStatus();
    this.refreshRings();
  }

  private refreshStatus(): void {
    this.mairie.status().subscribe({
      next: (s) => this.status.set(s),
      error: () => this.errorText.set("Impossible de charger le statut de la mairie."),
    });
  }

  private refreshRings(): void {
    this.inventory.listItems('MISC').subscribe({
      next: (page) => this.rings.set(page.content.filter(i => i.item.subType === 'RING')),
      error: () => this.rings.set([]),
    });
  }

  search(): void {
    const q = this.searchQuery.trim();
    if (!q) { this.searchResults.set([]); return; }
    this.searching.set(true);
    this.mairie.search(q).subscribe({
      next: (page) => {
        this.searching.set(false);
        this.searchResults.set(page.content.filter(u => u.id !== this.myId()));
      },
      error: () => { this.searching.set(false); this.searchResults.set([]); },
    });
  }

  pickTarget(user: UserListItem): void {
    this.errorText.set(null);
    this.selectedTarget.set(user);
    this.selectedRingId = this.rings()[0]?.id ?? null;
  }

  cancelPick(): void {
    this.selectedTarget.set(null);
    this.selectedRingId = null;
  }

  propose(): void {
    const target = this.selectedTarget();
    if (!target || this.selectedRingId == null) return;
    this.busy.set(true);
    this.errorText.set(null);
    this.mairie.propose(target.id, this.selectedRingId).subscribe({
      next: () => {
        this.busy.set(false);
        this.infoText.set(`Demande envoyée à ${target.username}.`);
        this.cancelPick();
        this.refreshStatus();
        this.refreshRings();
      },
      error: (err) => {
        this.busy.set(false);
        this.errorText.set(err?.error?.message ?? "Échec de la demande.");
      },
    });
  }

  accept(proposalId: number): void {
    this.busy.set(true);
    this.errorText.set(null);
    this.mairie.accept(proposalId).subscribe({
      next: () => { this.busy.set(false); this.refreshStatus(); this.refreshRings(); },
      error: (err) => { this.busy.set(false); this.errorText.set(err?.error?.message ?? "Échec."); },
    });
  }

  decline(proposalId: number): void {
    this.busy.set(true);
    this.mairie.decline(proposalId).subscribe({
      next: () => { this.busy.set(false); this.refreshStatus(); },
      error: () => this.busy.set(false),
    });
  }

  cancelProposal(proposalId: number): void {
    this.busy.set(true);
    this.mairie.cancel(proposalId).subscribe({
      next: () => { this.busy.set(false); this.refreshStatus(); this.refreshRings(); },
      error: () => this.busy.set(false),
    });
  }

  convert(): void {
    const amount = this.pezToConvert;
    if (!amount || amount <= 0) return;
    this.busy.set(true);
    this.errorText.set(null);
    this.mairie.convert(amount).subscribe({
      next: () => {
        this.busy.set(false);
        this.pezToConvert = null;
        this.infoText.set('Conversion effectuée.');
        this.auth.refreshUser();
      },
      error: (err) => {
        this.busy.set(false);
        this.errorText.set(err?.error?.message ?? 'Échec de la conversion.');
      },
    });
  }
}
