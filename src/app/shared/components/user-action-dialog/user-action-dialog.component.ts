import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RoomUser, RoomPermission, RoomErrorPayload } from '@toon-live/game-types';
import { AuthService } from '../../../core/services/auth.service';
import { SocketService } from '../../../core/services/socket.service';
import { ModerationService } from '../../../core/services/moderation.service';
import { AvatarBadgeComponent } from '../avatar-badge/avatar-badge.component';
import { Subscription } from 'rxjs';

interface DurationOption {
  label: string;
  /** null = permanent */
  hours: number | null;
}

const DURATIONS: DurationOption[] = [
  { label: '1 heure',    hours: 1 },
  { label: '1 jour',     hours: 24 },
  { label: '3 jours',    hours: 72 },
  { label: '1 semaine',  hours: 24 * 7 },
  { label: '1 mois',     hours: 24 * 30 },
  { label: 'Permanent',  hours: null },
];

/**
 * Opened by clicking a player — in-game avatar (GameCore 'avatar:click') or
 * a row in GameMenuComponent's room user list. Slides in from the right,
 * same visual language as GameMenuComponent's own panel.
 */
@Component({
  selector: 'app-user-action-dialog',
  standalone: true,
  imports: [FormsModule, AvatarBadgeComponent],
  templateUrl: './user-action-dialog.component.html',
  styleUrls: ['./user-action-dialog.component.scss'],
})
export class UserActionDialogComponent implements OnInit, OnDestroy {
  @Input({ required: true }) target!: RoomUser;
  @Input({ required: true }) roomId!: string;
  @Output() close = new EventEmitter<void>();

  private readonly auth = inject(AuthService);
  private readonly socket = inject(SocketService);
  private readonly moderation = inject(ModerationService);

  private errorSub?: Subscription;

  readonly durations = DURATIONS;
  selectedDuration = DURATIONS[0];
  message = '';
  siteBanReason = '';
  sending = signal(false);
  errorText = signal<string | null>(null);

  readonly myId = computed(() => this.auth.user()?.id ?? '');
  readonly myRank = computed(() => this.auth.user()?.rank ?? 0);
  readonly isSelf = computed(() => this.target?.userId === this.myId());

  /** Room owner or admin — same rule enforced server-side (RoomAccessService). */
  readonly canManageRoom = computed(() => {
    const state = this.socket.roomState();
    return !this.isSelf() && !!state && state.yourPermission >= RoomPermission.OWN;
  });

  /** Moderator or admin, site-wide — independent of which room you're in. */
  readonly canSiteBan = computed(() => !this.isSelf() && this.myRank() >= 1);

  ngOnInit(): void {
    this.errorSub = this.socket.roomError$.subscribe((e: RoomErrorPayload) => {
      if (e.code !== 'MODERATION_ACTION_FAILED') return;
      this.sending.set(false);
      this.errorText.set(e.message);
    });
  }

  ngOnDestroy(): void {
    this.errorSub?.unsubscribe();
  }

  sendMessage(): void {
    const text = this.message.trim();
    if (!text) return;
    this.socket.sendPrivateMessage(this.roomId, { toUserId: this.target.userId, text });
    this.message = '';
  }

  kick(): void {
    this.errorText.set(null);
    this.socket.sendRoomKick(this.roomId, { targetUserId: this.target.userId });
    this.close.emit();
  }

  banRoom(): void {
    this.errorText.set(null);
    this.socket.sendRoomBan(this.roomId, { targetUserId: this.target.userId });
    this.close.emit();
  }

  banSite(): void {
    const reason = this.siteBanReason.trim();
    if (!reason) { this.errorText.set('Le motif est obligatoire.'); return; }

    const bannedUntil = this.selectedDuration.hours === null
      ? null
      : new Date(Date.now() + this.selectedDuration.hours * 3600_000).toISOString();

    this.errorText.set(null);
    this.sending.set(true);
    this.moderation.banSite(this.target.userId, { reason, bannedUntil }).subscribe({
      next: () => { this.sending.set(false); this.close.emit(); },
      error: (err) => {
        this.sending.set(false);
        this.errorText.set(err?.error?.message ?? 'Échec du bannissement.');
      },
    });
  }
}
