import { Component, OnInit, inject, signal } from '@angular/core';
import { JustMarried, Spouse } from '@toon-live/game-types';
import { MairieService } from '../../../../core/services/mairie.service';
import { AvatarBadgeComponent } from '../../../../shared/components/avatar-badge/avatar-badge.component';

/**
 * Home page panel — the last couple to get married, site-wide. Same idea as
 * the old CMS's `.just_married` block (`accueil.tpl`/`accueil.php`): shows
 * the two toons side by side with their pseudo colored by gender. Renders
 * nothing if nobody has ever gotten married yet (204 from the backend).
 */
@Component({
  selector: 'app-just-married-panel',
  standalone: true,
  imports: [AvatarBadgeComponent],
  templateUrl: './just-married-panel.component.html',
  styleUrls: ['./just-married-panel.component.scss'],
})
export class JustMarriedPanelComponent implements OnInit {
  private readonly mairie = inject(MairieService);

  couple = signal<JustMarried | null>(null);

  ngOnInit(): void {
    this.mairie.lastMarried().subscribe({
      next: (c) => this.couple.set(c),
      error: () => this.couple.set(null),
    });
  }

  /** Same convention as chat/identity-card's genderClass: unknown gender falls back to the "man" bucket. */
  genderColor(gender: string | null): string {
    return gender === 'FEMALE' ? '#e2007a' : '#009ee0';
  }

  /** For AvatarBadgeComponent's [override] — same default skin used elsewhere when none is set. */
  avatarOverride(spouse: Spouse): { skinColor: number; clothing: Record<string, string> } {
    return { skinColor: spouse.skinColor ?? 0xf7ceaf, clothing: spouse.clothing };
  }
}
