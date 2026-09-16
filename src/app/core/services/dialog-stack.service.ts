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

  // ─── Position claiming ──────────────────────────────────────────────────

  /**
   * Every panel used to hardcode its own on-open (top, left) in SCSS,
   * several literally the SAME pixel values as each other (inventory/shop/
   * zone-texture-picker all `left: calc(16px + 550px + 16px)`;
   * friends/navigator/profile all `left: 16px; top: 80px`) — reasoned about
   * independently, assuming nothing else would be open there at once. Two of
   * those ever ARE open together (e.g. friends + profile, from clicking a
   * friend) and land stacked exactly on top of each other. Others (mairie:
   * `16+550+16+700+16`) hardcoded an assumed neighbor's width instead,
   * breaking the moment that neighbor isn't actually open or the window
   * isn't wide enough — the real "pas responsive" complaint: mairie's own
   * 380px panel already starts past the right edge of a 1280px viewport.
   *
   * claimPosition nudges a panel's own preferred spot diagonally past
   * whatever's ALREADY open there, then clamps inside the current viewport
   * — called once per open (ngOnInit), not continuously: a panel the user
   * drags on top of another afterward is normal window behaviour, not a bug
   * to keep fighting.
   */
  private openRects = new Map<string, { top: number; left: number; width: number; height: number }>();
  private nextId = 0;

  /** A fresh id per open — two instances of the SAME panel type (there
   *  aren't any today, but nothing here assumes a singleton) must not be
   *  treated as the same slot. */
  newInstanceId(): string {
    return `dlg-${++this.nextId}`;
  }

  claimPosition(id: string, preferredTop: number, preferredLeft: number, width: number, height: number): { top: number; left: number } {
    const STEP = 28;
    const MARGIN = 8;
    let top = preferredTop;
    let left = preferredLeft;

    let guard = 0;
    while (guard++ < 20 && this.overlapsAny(id, top, left, width, height)) {
      top += STEP;
      left += STEP;
    }

    // Clamp inside the viewport rather than the (possibly now off-screen,
    // after 20 cascades) nudged spot — a panel wider/taller than the
    // viewport itself just pins to the top-left margin instead of
    // guaranteeing zero overlap, which is the better failure mode on a
    // small screen (visible and usable beats perfectly non-overlapping and
    // half off-screen).
    const maxLeft = Math.max(MARGIN, window.innerWidth - width - MARGIN);
    const maxTop = Math.max(MARGIN, window.innerHeight - height - MARGIN);
    top = Math.min(Math.max(MARGIN, top), maxTop);
    left = Math.min(Math.max(MARGIN, left), maxLeft);

    this.openRects.set(id, { top, left, width, height });
    return { top, left };
  }

  /** Call on destroy/close — otherwise the next panel opened keeps nudging
   *  past a slot nothing occupies anymore. */
  release(id: string): void {
    this.openRects.delete(id);
  }

  private overlapsAny(excludeId: string, top: number, left: number, width: number, height: number): boolean {
    for (const [id, r] of this.openRects) {
      if (id === excludeId) continue;
      const separate = left + width <= r.left || r.left + r.width <= left || top + height <= r.top || r.top + r.height <= top;
      if (!separate) return true;
    }
    return false;
  }

  /**
   * bringToFront() + claimPosition() in one call, for the common case (every
   * panel does both together, on open). `preferredLeft: 'center'` centers on
   * the CURRENT viewport width instead of a fixed px — replaces the old
   * `left: 50%; transform: translateX(-50%)` CSS trick, which cdkDrag (used
   * by every one of these panels) silently broke: CDK overwrites
   * `style.transform` wholesale the instant a drag starts, so the centering
   * vanished and the panel jumped on the first drag.
   */
  open(id: string, preferredTop: number, preferredLeft: number | 'center', width: number, height: number): { zIndex: number; top: number; left: number } {
    const left = preferredLeft === 'center' ? (window.innerWidth - width) / 2 : preferredLeft;
    const { top, left: claimedLeft } = this.claimPosition(id, preferredTop, left, width, height);
    return { zIndex: this.bringToFront(), top, left: claimedLeft };
  }
}
