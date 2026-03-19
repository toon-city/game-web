import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';
import { NgFor } from '@angular/common';
import { RoomInfo, HouseInfo } from '@toon-live/game-types';
import { AuthService } from '../../core/services/auth.service';
import { HouseService } from '../../core/services/house.service';
import { environment } from '../../../environments/environment';
import { CreateHouseDialogComponent } from './components/create-house-dialog/create-house-dialog.component';
import { EnterHouseDialogComponent } from './components/enter-house-dialog/enter-house-dialog.component';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [
    MatCardModule, MatButtonModule, MatIconModule, MatChipsModule,
    MatToolbarModule, MatInputModule, MatFormFieldModule, MatTooltipModule,
    MatDividerModule, MatDialogModule, MatSnackBarModule, FormsModule, NgFor,
  ],
  templateUrl: './lobby.component.html',
  styleUrls: ['./lobby.component.scss'],
})
export class LobbyComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  readonly auth = inject(AuthService);
  private houseService = inject(HouseService);

  // ── Salles publiques ──────────────────────────────────────────────────────
  publicRooms = signal<RoomInfo[]>([]);

  // ── Maisons privées ───────────────────────────────────────────────────────
  privateHouses = signal<HouseInfo[]>([]);
  searchQuery = '';
  showingAll = false;

  ngOnInit(): void {
    this.loadPublicRooms();
    this.loadActiveHouses();
  }

  private loadPublicRooms(): void {
    this.http.get<RoomInfo[]>(`${environment.apiUrl}/rooms`).subscribe({
      next: (rooms) => this.publicRooms.set(rooms),
    });
  }

  loadActiveHouses(): void {
    this.showingAll = false;
    this.searchQuery = '';
    this.houseService.listHouses().subscribe({
      next: (houses) => this.privateHouses.set(houses),
    });
  }

  searchHouses(): void {
    this.showingAll = true;
    this.houseService.listHouses().subscribe({
      next: (houses) => {
        const q = this.searchQuery.toLowerCase().trim();
        this.privateHouses.set(
          q ? houses.filter((h) => h.name.toLowerCase().includes(q)) : houses,
        );
      },
    });
  }

  clearSearch(): void {
    this.loadActiveHouses();
  }

  joinRoom(roomId: string): void {
    this.router.navigate(['/room', roomId]);
  }

  joinHouse(house: HouseInfo): void {
    if (house.access === 'CLOSED') {
      this.snack.open('Cette maison est fermée.', 'OK', { duration: 3000, panelClass: 'snack-info' });
      return;
    }
    if (house.access === 'PASSWORD') {
      this.dialog.open(EnterHouseDialogComponent, { data: { house } })
        .afterClosed().subscribe((ok) => {
          if (ok) this.router.navigate(['/room', house.id]);
        });
      return;
    }
    this.houseService.enterHouse(house.id).subscribe({
      next: () => this.router.navigate(['/room', house.id]),
      error: (err: HttpErrorResponse) => {
        this.snack.open(err.error?.message || 'Accès refusé', 'OK', { duration: 3000, panelClass: 'snack-error' });
      },
    });
  }

  openCreateHouseDialog(): void {
    this.dialog.open(CreateHouseDialogComponent, { width: '480px' })
      .afterClosed().subscribe((created: HouseInfo | undefined) => {
        if (created) {
          this.privateHouses.update((list) => [created, ...list]);
          this.snack.open(`Maison "${created.name}" créée !`, 'OK', { duration: 3000, panelClass: 'snack-success' });
        }
      });
  }

  logout(): void {
    this.auth.logout();
  }

  accessIcon(access: HouseInfo['access']): string {
    return access === 'OPEN' ? 'lock_open' : access === 'PASSWORD' ? 'password' : 'lock';
  }

  accessLabel(access: HouseInfo['access']): string {
    return access === 'OPEN' ? 'Ouvert' : access === 'PASSWORD' ? 'Mot de passe' : 'Fermé';
  }
}
