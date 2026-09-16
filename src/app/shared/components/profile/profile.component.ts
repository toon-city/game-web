import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { EquippedItemInfo, UserProfile, FriendsStatus } from '@toon-live/game-types';
import { AuthService } from '../../../core/services/auth.service';
import { ProfileService } from '../../../core/services/profile.service';
import { FriendService } from '../../../core/services/friend.service';
import { DialogStackService } from '../../../core/services/dialog-stack.service';
import { InventoryService } from '../../../core/services/inventory.service';
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
  private readonly dialogStack = inject(DialogStackService);
  private readonly inventory = inject(InventoryService);

  /** Bumped on open and on every drag — "dernier affiché + dernier déplacé". */
  zIndex = signal(100);
  private readonly friendService = inject(FriendService);

  friendActionText = signal<string | null>(null);
  friendActionError = signal<string | null>(null);
  private friendsStatus = signal<FriendsStatus | null>(null);

  /** 'friend': already friends — 'sent': I've got a pending request out to
   *  them — 'none': neither, show "Ajouter en ami". Received requests
   *  aren't handled here (accept/decline already live in the Amis panel's
   *  requests tab) — only my own outgoing state matters for this button. */
  readonly friendButtonState = computed<'friend' | 'sent' | 'none'>(() => {
    const status = this.friendsStatus();
    if (!status) return 'none';
    if (status.friends.some(f => f.userId === this.userId)) return 'friend';
    if (status.sentRequests.some(r => r.otherUserId === this.userId)) return 'sent';
    return 'none';
  });

  private readonly pendingRequestId = computed(() =>
    this.friendsStatus()?.sentRequests.find(r => r.otherUserId === this.userId)?.id ?? null);

  readonly slots = SLOTS;

  profile = signal<UserProfile | null>(null);
  loading = signal(false);
  errorText = signal<string | null>(null);

  editing = signal(false);
  editDescription = '';
  editJob = '';
  saving = signal(false);

  workOutfitBusy = signal(false);

  readonly isOwner = computed(() => this.auth.user()?.id === this.userId);

  readonly avatarOverride = computed(() => {
    const p = this.profile();
    if (!p) return undefined;
    return { skinColor: p.skinColor ?? 0xffffff, clothing: p.clothing };
  });

  ngOnInit(): void {
    this.zIndex.set(this.dialogStack.bringToFront());
    this.load();
  }

  onDragStarted(): void {
    this.zIndex.set(this.dialogStack.bringToFront());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['userId'] && !changes['userId'].firstChange) {
      // Same component instance reused for a different profile (the @if
      // in app.component.html only toggles on openUserId() being null vs
      // not) — switching to someone else's profile counts as "displayed"
      // just as much as the very first open did.
      this.zIndex.set(this.dialogStack.bringToFront());
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

  /**
   * Owner-only (gated in the template by isOwner()) — flips the overlay and
   * reloads the profile so the avatar preview/slots reflect it immediately,
   * plus the same "clothing changed" notification equip/unequip already
   * send (identity badge + room broadcast if currently in one).
   */
  toggleWorkOutfit(active: boolean): void {
    this.workOutfitBusy.set(true);
    this.profileService.setWorkOutfitActive(this.userId, active).subscribe({
      next: () => {
        this.workOutfitBusy.set(false);
        this.inventory.notifyClothingChanged();
        this.load();
      },
      error: () => this.workOutfitBusy.set(false),
    });
  }

  addFriend(): void {
    this.friendService.sendRequest(this.userId).subscribe({
      next: () => {
        this.friendActionError.set(null);
        this.friendActionText.set('Demande envoyée.');
        this.refreshFriendsStatus();
      },
      error: (err) => { this.friendActionText.set(null); this.friendActionError.set(err?.error?.message ?? 'Échec de la demande.'); },
    });
  }

  removeFriend(): void {
    this.friendService.removeFriend(this.userId).subscribe({
      next: () => {
        this.friendActionError.set(null);
        this.friendActionText.set('Retiré de vos amis.');
        this.refreshFriendsStatus();
      },
      error: (err) => { this.friendActionText.set(null); this.friendActionError.set(err?.error?.message ?? 'Échec du retrait.'); },
    });
  }

  cancelFriendRequest(): void {
    const requestId = this.pendingRequestId();
    if (requestId === null) return;
    this.friendService.cancel(requestId).subscribe({
      next: () => {
        this.friendActionError.set(null);
        this.friendActionText.set('Demande annulée.');
        this.refreshFriendsStatus();
      },
      error: (err) => { this.friendActionText.set(null); this.friendActionError.set(err?.error?.message ?? 'Échec de l\'annulation.'); },
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
    this.refreshFriendsStatus();
  }

  private refreshFriendsStatus(): void {
    this.friendService.status().subscribe({
      next: (s) => this.friendsStatus.set(s),
      error: () => {}, // button just falls back to "Ajouter en ami" (friendButtonState defaults 'none' on null)
    });
  }
}
