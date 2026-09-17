import { Injectable, signal } from '@angular/core';

/**
 * Single source of truth for "are we on a mobile layout" — same breakpoint
 * as every `@media (max-width: 767.98px)` rule across the in-game UI, kept
 * in sync deliberately rather than duplicating the number. Used only where
 * CSS alone can't do the job: disabling CDK drag on dialogs, and mounting/
 * unmounting the on-screen movement joystick.
 */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private static readonly QUERY = '(max-width: 767.98px)';

  private readonly mql = window.matchMedia(ViewportService.QUERY);
  private readonly _isMobile = signal(this.mql.matches);
  readonly isMobile = this._isMobile.asReadonly();

  constructor() {
    this.mql.addEventListener('change', (e) => this._isMobile.set(e.matches));
  }
}
