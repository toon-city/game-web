import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface ConnectedUserStat {
  username: string;
  roomId: string;
  roomName: string;
  gender: string | null;
  rank: number;
  toonizLevel: number;
}

export interface ServerStats {
  totalConnected: number;
  users: ConnectedUserStat[];
}

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly serverUrl = environment.wsUrl;

  readonly stats = signal<ServerStats>({ totalConnected: 0, users: [] });

  constructor(private readonly http: HttpClient) {}

  refresh(): void {
    this.http.get<ServerStats>(`${this.serverUrl}/stats`).subscribe({
      next: data => this.stats.set(data),
      error: () => {},
    });
  }
}
