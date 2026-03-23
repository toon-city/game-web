import { Component, inject, signal, effect } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-identity-card',
  standalone: true,
  imports: [],
  templateUrl: './identity-card.component.html',
  styleUrls: ['./identity-card.component.scss'],
})
export class IdentityCardComponent {
  readonly auth = inject(AuthService);

  readonly kredsDiff = signal<number | null>(null);
  readonly pezDiff   = signal<number | null>(null);
  readonly showKredsDiff = signal(false);
  readonly showPezDiff   = signal(false);

  private prevKreds = this.auth.user()?.kreds ?? 0;
  private prevPez   = this.auth.user()?.pez   ?? 0;
  private kredsDiffTimer?: ReturnType<typeof setTimeout>;
  private pezDiffTimer?:   ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (!user) return;

      const newKreds = user.kreds ?? 0;
      const newPez   = user.pez   ?? 0;

      if (newKreds !== this.prevKreds) {
        this.kredsDiff.set(newKreds - this.prevKreds);
        this.prevKreds = newKreds;
        this.showKredsDiff.set(true);
        clearTimeout(this.kredsDiffTimer);
        this.kredsDiffTimer = setTimeout(() => this.showKredsDiff.set(false), 2500);
      }

      if (newPez !== this.prevPez) {
        this.pezDiff.set(newPez - this.prevPez);
        this.prevPez = newPez;
        this.showPezDiff.set(true);
        clearTimeout(this.pezDiffTimer);
        this.pezDiffTimer = setTimeout(() => this.showPezDiff.set(false), 2500);
      }
    });
  }
}
