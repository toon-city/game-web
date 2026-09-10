import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface SiteBanRequest {
  reason: string;
  /** ISO datetime string, or null for a permanent ban. */
  bannedUntil: string | null;
}

/**
 * Site-wide ban — reuses game-api's existing AdminUserController
 * (POST /api/admin/users/{id}/ban, @PreAuthorize hasAnyRole MODERATOR/ADMIN).
 * That endpoint already enforces "a moderator can't ban an admin or another
 * moderator" and self-ban prevention server-side; nothing to duplicate here.
 * The caller's own JWT (already moderator/admin to even see this button) is
 * all the auth this needs — no separate admin session.
 */
@Injectable({ providedIn: 'root' })
export class ModerationService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = environment.apiUrl;

  banSite(userId: string, req: SiteBanRequest) {
    return this.http.post(`${this.apiBase}/admin/users/${userId}/ban`, req);
  }
}
