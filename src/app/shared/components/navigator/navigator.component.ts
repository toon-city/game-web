import { Component, EventEmitter, inject, OnInit, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { HttpErrorResponse } from '@angular/common/http';
import { HouseInfo, RoomInfo } from '@toon-live/game-types';
import { HouseService } from '../../../core/services/house.service';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { CreateHouseDialogComponent } from '../../../features/lobby/components/create-house-dialog/create-house-dialog.component';
import { EnterHouseDialogComponent } from '../../../features/lobby/components/enter-house-dialog/enter-house-dialog.component';

type FilterMode = 'PUBLIC' | 'TOUS' | 'MES_MAISONS';

@Component({
  selector: 'app-navigator',
  standalone: true,
  imports: [FormsModule, DragDropModule, MatDialogModule, MatSnackBarModule],
  templateUrl: './navigator.component.html',
  styleUrls: ['./navigator.component.scss'],
})
export class NavigatorComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  @Output() joined = new EventEmitter<void>();

  private http = inject(HttpClient);
  private houseService = inject(HouseService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  readonly auth = inject(AuthService);

  filter = signal<FilterMode>('PUBLIC');
  searchQuery = '';

  publicRooms = signal<RoomInfo[]>([]);
  allHouses = signal<HouseInfo[]>([]);

  get filteredRows(): Array<{ id: string | number; name: string; owner: string; users: string; access: string; type: 'room' | 'house' }> {
    const q = this.searchQuery.toLowerCase().trim();
    const hasSearch = q.length > 0;
    let rows: Array<{ id: string | number; name: string; owner: string; users: string; access: string; type: 'room' | 'house' }> = [];

    if (this.filter() === 'PUBLIC') {
      rows = this.publicRooms().map(r => ({
        id: r.id, name: r.name, owner: '—',
        users: `${r.userCount}/${r.maxUsers}`, access: 'OPEN', type: 'room' as const,
      }));
    } else if (this.filter() === 'TOUS') {
      // Logements privés : tous si recherche active, sinon uniquement ceux avec au moins 1 personne
      const houses = hasSearch
        ? this.allHouses()
        : this.allHouses().filter(h => (h.userCount ?? 0) >= 1);
      rows = [
        ...this.publicRooms().map(r => ({
          id: r.id, name: r.name, owner: '—',
          users: `${r.userCount}/${r.maxUsers}`, access: 'OPEN', type: 'room' as const,
        })),
        ...houses.map(h => ({
          id: h.id, name: h.name, owner: h.ownerUsername ?? '—',
          users: `${h.userCount ?? 0}/${h.maxUsers}`, access: h.access, type: 'house' as const,
        })),
      ];
    } else {
      const myUsername = this.auth.user()?.username;
      rows = this.allHouses()
        .filter(h => h.ownerUsername === myUsername)
        .map(h => ({
          id: h.id, name: h.name, owner: h.ownerUsername ?? '—',
          users: `${h.userCount ?? 0}/${h.maxUsers}`, access: h.access, type: 'house' as const,
        }));
    }

    if (hasSearch) {
      rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q));
    }
    return rows;
  }

  ngOnInit(): void {
    this.loadData();
  }

  setFilter(f: FilterMode): void {
    this.filter.set(f);
    this.loadData();
  }

  private loadData(): void {
    this.http.get<RoomInfo[]>(`${environment.apiUrl}/rooms`).subscribe({
      next: (rooms) => this.publicRooms.set(rooms),
    });
    if (this.filter() !== 'PUBLIC') {
      this.houseService.listHouses().subscribe({
        next: (houses) => this.allHouses.set(houses),
      });
    }
  }

  joinRow(row: { id: string | number; type: 'room' | 'house'; access: string; name: string }): void {
    if (row.type === 'room') {
      this.joined.emit();
      this.router.navigate(['/room', row.id]);
      return;
    }
    // house
    if (row.access === 'CLOSED') {
      this.snack.open('Cette maison est fermée.', 'OK', { duration: 3000, panelClass: 'snack-info' });
      return;
    }
    const house = this.allHouses().find(h => h.id === row.id);
    if (!house) return;
    if (house.access === 'PASSWORD') {
      this.dialog.open(EnterHouseDialogComponent, { data: { house } })
        .afterClosed().subscribe((ok) => {
          if (ok) {
            this.joined.emit();
            this.router.navigate(['/room', house.id]);
          }
        });
      return;
    }
    this.houseService.enterHouse(+house.id).subscribe({
      next: () => {
        this.joined.emit();
        this.router.navigate(['/room', house.id]);
      },
      error: (err: HttpErrorResponse) => {
        this.snack.open(err.error?.message || 'Accès refusé', 'OK', { duration: 3000, panelClass: 'snack-error' });
      },
    });
  }

  openCreateHouseDialog(): void {
    this.dialog.open(CreateHouseDialogComponent, { width: '480px' })
      .afterClosed().subscribe((created: HouseInfo | undefined) => {
        if (created) {
          this.allHouses.update(list => [created, ...list]);
          this.snack.open(`Maison "${created.name}" créée !`, 'OK', { duration: 3000, panelClass: 'snack-success' });
        }
      });
  }
}
