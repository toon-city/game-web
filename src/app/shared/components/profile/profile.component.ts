import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { EquippedItemInfo, UserProfile } from '@toon-live/game-types';
import { AuthService } from '../../../core/services/auth.service';
import { ProfileService } from '../../../core/services/profile.service';
import { FriendService } from '../../../core/services/friend.service';
import { AvatarBadgeComponent } from '../avatar-badge/avatar-badge.component';

/** Fixed slot layout around the avatar — always these 6 positions, filled or empty. */
const SLOTS: { subType: string; label: string; pos: string }[] = [
  { subType: 'HAIRSTYLE', label: 'Cheveux',  pos: 'tl' },
  { subType: 'HAT',       label: 'Chapeau',  pos: 'tr' },
  { subType: 'MAKEUP',    label: 'Visage',   pos: 'ml' },
  { subType: 'RING',      label: 'Bague',    pos: 'mr' },
  { subType: 'TOP',       label: 'Haut',     pos: 'bl' },
  { subType: 'BOTTOM',    label: 'Bas',      pos: 'br' },
];

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, DragDropModule, AvatarBadgeComponent],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnInit, OnChanges {
  @Input({ required: true }) userId!: string;
  @Output() close = new EventEmitter<void>();

  private readonly auth = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly friendService = inject(FriendService);

  friendActionText = signal<string | null>(null);
  friendActionError = signal<string | null>(null);

  readonly slots = SLOTS;

  profile = signal<UserProfile | null>(null);
  loading = signal(false);
  errorText = signal<string | null>(null);

  editing = signal(false);
  editDescription = '';
  editJob = '';
  saving = signal(false);

  readonly isOwner = computed(() => this.auth.user()?.id === this.userId);

  readonly avatarOverride = computed(() => {
    const p = this.profile();
    if (!p) return undefined;
    return { skinColor: p.skinColor ?? 0xf7ceaf, clothing: p.clothing };
  });

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['userId'] && !changes['userId'].firstChange) {
      this.editing.set(false);
      this.friendActionText.set(null);
      this.friendActionError.set(null);
      this.load();
    }
  }

  slotItem(subType: string): EquippedItemInfo | undefined {
    return this.profile()?.equippedItems.find(i => i.subType === subType);
  }

  startEdit(): void {
    const p = this.profile();
    if (!p) return;
    this.editDescription = p.description ?? '';
    this.editJob = p.job ?? '';
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
  }

  save(): void {
    this.saving.set(true);
    this.profileService.updateDescription(this.userId, this.editDescription, this.editJob).subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(false);
        this.profile.update(p => p ? { ...p, description: this.editDescription, job: this.editJob } : p);
      },
      error: () => this.saving.set(false),
    });
  }

  addFriend(): void {
    this.friendService.sendRequest(this.userId).subscribe({
      next: () => { this.friendActionError.set(null); this.friendActionText.set('Demande envoyée.'); },
      error: (err) => { this.friendActionText.set(null); this.friendActionError.set(err?.error?.message ?? 'Échec de la demande.'); },
    });
  }

  blockUser(): void {
    this.friendService.block(this.userId).subscribe({
      next: () => { this.friendActionError.set(null); this.friendActionText.set('Toon bloqué.'); },
      error: (err) => { this.friendActionText.set(null); this.friendActionError.set(err?.error?.message ?? 'Échec du blocage.'); },
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR');
  }

  private load(): void {
    this.loading.set(true);
    this.errorText.set(null);
    this.profileService.get(this.userId).subscribe({
      next: (p) => { this.loading.set(false); this.profile.set(p); },
      error: () => { this.loading.set(false); this.errorText.set('Impossible de charger ce profil.'); },
    });
  }
}
