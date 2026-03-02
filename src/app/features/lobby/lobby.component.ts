import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatToolbarModule } from '@angular/material/toolbar';
import { NgFor } from '@angular/common';
import { RoomInfo } from '@toon-live/game-types';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatIconModule, MatChipsModule, MatToolbarModule, NgFor],
  templateUrl: './lobby.component.html',
  styleUrls: ['./lobby.component.scss'],
})
export class LobbyComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  readonly auth = inject(AuthService);

  rooms = signal<RoomInfo[]>([]);

  ngOnInit(): void {
    this.http.get<RoomInfo[]>('http://localhost:3001/api/rooms').subscribe({
      next: (rooms) => this.rooms.set(rooms),
    });
  }

  joinRoom(roomId: string): void {
    this.router.navigate(['/room', roomId]);
  }

  logout(): void {
    this.auth.logout();
  }
}
