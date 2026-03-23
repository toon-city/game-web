import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface UserListItem {
  username: string;
  gender: string | null;
  rank: number;
  toonizLevel: number;
  lastLoginAt: string | null;
  online: boolean;
  currentRoomId: number | null;
}

export interface UserPage {
  content: UserListItem[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  onlineCount: number;
}

@Injectable({ providedIn: 'root' })
export class UserListService {
  readonly page = signal<UserPage | null>(null);
  readonly loading = signal(false);

  constructor(private readonly http: HttpClient) {}

  load(q: string, pageIndex: number, size = 15): void {
    this.loading.set(true);
    const params = new HttpParams()
      .set('q', q)
      .set('page', pageIndex)
      .set('size', size);
    this.http.get<UserPage>(`${environment.apiUrl}/users`, { params }).subscribe({
      next: data => {
        this.page.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
