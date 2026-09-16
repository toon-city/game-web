import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MetierOption } from '@toon-live/game-types';
import { environment } from '../../../environments/environment';

/** HTTP + "is the picker dialog open" UI state bundled together, same reasoning as ProfileService. */
@Injectable({ providedIn: 'root' })
export class MetierService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/metiers`;

  /** Always about the current user — no target id needed, unlike ProfileService.openUserId. */
  readonly pickerOpen = signal(false);

  openPicker(): void {
    this.pickerOpen.set(true);
  }

  closePicker(): void {
    this.pickerOpen.set(false);
  }

  listOptions(): Observable<MetierOption[]> {
    return this.http.get<MetierOption[]>(this.base);
  }

  choose(metierId: number): Observable<MetierOption> {
    return this.http.post<MetierOption>(`${this.base}/choose`, { metierId });
  }
}
