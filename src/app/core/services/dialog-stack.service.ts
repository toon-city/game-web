import { Injectable } from '@angular/core';

/**
 * Shared z-index counter for the draggable "dialog" panels (shop, inventory,
 * profile, mairie, friends, navigator — every cdkDrag'd .ui-block). They all
 * shared a single static z-index (100) before, so which one ended up on top
 * was just DOM order, not "whichever I actually opened or moved last".
 *
 * Each dialog calls bringToFront() when it's opened (ngOnInit) and again
 * whenever the user starts dragging it (cdkDragStarted) — exactly "dernier
 * affiché + dernier déplacé" — then binds its own z-index to the returned
 * value instead of a fixed number.
 */
@Injectable({ providedIn: 'root' })
export class DialogStackService {
  /** Same floor the panels' own SCSS z-index:100 already used, so a single
   *  open dialog looks identical to before this existed. */
  private top = 100;

  bringToFront(): number {
    this.top += 1;
    return this.top;
  }
}
