import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MetierOption } from '@toon-live/game-types';
import { AuthService } from '../../../core/services/auth.service';
import { MetierService } from '../../../core/services/metier.service';
import { DialogStackService } from '../../../core/services/dialog-stack.service';

/**
 * Player-facing métier picker — reached by clicking the métier area of the
 * identity card (same "click to open a dialog" convention as clicking the
 * avatar for a profile). Lists the whole catalogue with per-option
 * eligibility already computed server-side (MetierAssignmentService), so
 * this component just renders whatever blockReason it's given.
 */
@Component({
  selector: 'app-metier-picker',
  standalone: true,
  imports: [DragDropModule],
  templateUrl: './metier-picker.component.html',
  styleUrls: ['./metier-picker.component.scss'],
})
export class MetierPickerComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly metierService = inject(MetierService);
  private readonly dialogStack = inject(DialogStackService);
  private readonly dialogId = this.dialogStack.newInstanceId();

  zIndex = signal(100);
  /** Was `left: 50%; transform: translateX(-50%)` in the SCSS — cdkDrag
   *  overwrites `style.transform` on drag start, silently discarding that
   *  centering (see trade-center.component.ts for the same fix). */
  pos = signal({ top: 90, left: 0 });
  options = signal<MetierOption[]>([]);
  loading = signal(false);
  busy = signal(false);
  errorText = signal<string | null>(null);

  ngOnInit(): void {
    const p = this.dialogStack.open(this.dialogId, 90, 'center', 380, 500);
    this.zIndex.set(p.zIndex);
    this.pos.set({ top: p.top, left: p.left });
    this.load();
  }

  ngOnDestroy(): void {
    this.dialogStack.release(this.dialogId);
  }

  onDragStarted(): void {
    this.zIndex.set(this.dialogStack.bringToFront());
  }

  close(): void {
    this.metierService.closePicker();
  }

  private load(): void {
    this.loading.set(true);
    this.metierService.listOptions().subscribe({
      next: (list) => { this.options.set(list); this.loading.set(false); },
      error: () => { this.errorText.set('Impossible de charger les métiers.'); this.loading.set(false); },
    });
  }

  choose(option: MetierOption): void {
    this.busy.set(true);
    this.errorText.set(null);
    this.metierService.choose(option.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.auth.refreshUser();
        this.close();
      },
      error: (err) => {
        this.busy.set(false);
        this.errorText.set(err?.error?.message ?? 'Échec du changement de métier.');
      },
    });
  }
}
