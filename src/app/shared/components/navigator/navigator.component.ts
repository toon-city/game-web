import { Component, EventEmitter, inject, OnInit, OnDestroy, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { HouseInfo, RoomInfo } from '@toon-live/game-types';
import { HouseService } from '../../../core/services/house.service';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';
import { CreateHouseDialogComponent } from '../../../features/lobby/components/create-house-dialog/create-house-dialog.component';
import { EnterHouseDialogComponent } from '../../../features/lobby/components/enter-house-dialog/enter-house-dialog.component';

type FilterMode = 'PUBLIC' | 'PRIVE' | 'MES_MAISONS';

interface PagedResponse<T> {
  content: T[];
  totalPages: number;
  totalElements: number;
}

type Row = { id: string | number; name: string; owner: string; users: string; access: string; type: 'room' | 'house' };

@Component({
  selector: 'app-navigator',
  standalone: true,
  imports: [FormsModule, DragDropModule, MatDialogModule, MatSnackBarModule],
  templateUrl: './navigator.component.html',
  styleUrls: ['./navigator.component.scss'],
})
export class NavigatorComponent implements OnInit, OnDestroy {
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

  rows     = signal<Row[]>([]);
  loading  = signal(false);
  currentPage = signal(0);
  readonly PAGE_SIZE   = 20;
  totalPages = signal(1);
  readonly skeletonRows = Array.from({ length: 8 }, (_, i) => i);

  private houseRefs: HouseInfo[] = [];
  private readonly searchSubject = new Subject<string>();
  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(() => {
      this.currentPage.set(0);
      this.loadData();
    });
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchChange(): void {
    this.searchSubject.next(this.searchQuery);
  }

  setFilter(f: FilterMode): void {
    this.filter.set(f);
    this.currentPage.set(0);
    this.loadData();
  }

  prevPage(): void {
    if (this.currentPage() > 0) {
      this.currentPage.update(p => p - 1);
      this.loadData();
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages() - 1) {
      this.currentPage.update(p => p + 1);
      this.loadData();
    }
  }

  private loadData(): void {
    this.loading.set(true);
    const f    = this.filter();
    const q    = this.searchQuery.trim();
    const page = this.currentPage();

    if (f === 'MES_MAISONS') {
      this.http.get<PagedResponse<HouseInfo>>(`${environment.apiUrl}/houses/mine/paged`, {
        params: { q, page, size: this.PAGE_SIZE },
      }).pipe(finalize(() => this.loading.set(false))).subscribe({
        next: (p) => {
          this.houseRefs = p.content;
          this.rows.set(p.content.map(h => toHouseRow(h)));
          this.totalPages.set(Math.max(1, p.totalPages));
        },
        error: (err: HttpErrorResponse) => {
          this.rows.set([]);
          const msg = err.status === 401
            ? 'Session expirée — veuillez vous reconnecter.'
            : 'Erreur lors du chargement de vos maisons.';
          this.snack.open(msg, 'OK', { duration: 3000, panelClass: 'snack-error' });
        },
      });
      return;
    }

    if (f === 'PUBLIC') {
      this.http.get<PagedResponse<RoomInfo>>(`${environment.apiUrl}/rooms/paged`, {
        params: { q, page, size: this.PAGE_SIZE },
      }).pipe(finalize(() => this.loading.set(false))).subscribe({
        next: (p) => {
          this.rows.set(p.content.map(r => toRoomRow(r)));
          this.totalPages.set(Math.max(1, p.totalPages));
        },
        error: () => { this.rows.set([]); },
      });
      return;
    }

    // PRIVÉ : logements privés. Sans recherche → avec joueurs seulement (géré côté back).
    this.http.get<PagedResponse<HouseInfo>>(`${environment.apiUrl}/houses/paged`, {
      params: { q, page, size: this.PAGE_SIZE },
    }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (housePage) => {
        this.houseRefs = housePage.content;
        this.rows.set(housePage.content.map(h => toHouseRow(h)));
        this.totalPages.set(Math.max(1, housePage.totalPages));
      },
      error: (err: HttpErrorResponse) => {
        this.rows.set([]);
        const msg = err.status === 401
          ? 'Session expirée — veuillez vous reconnecter.'
          : 'Erreur lors du chargement des logements privés.';
        this.snack.open(msg, 'OK', { duration: 3000, panelClass: 'snack-error' });
      },
    });
  }

  joinRow(row: Row): void {
    if (row.type === 'room') {
      this.joined.emit();
      this.router.navigate(['/room', row.id]);
      return;
    }

    // En mode MES_MAISONS, l'utilisateur est toujours propriétaire :
    // le backend l'autorise toujours, on appelle enterHouse directement.
    if (this.filter() === 'MES_MAISONS') {
      this.houseService.enterHouse(+row.id).subscribe({
        next: () => { this.joined.emit(); this.router.navigate(['/room', row.id]); },
        error: (err: HttpErrorResponse) => {
          this.snack.open(err.error?.message || 'Erreur', 'OK', { duration: 3000, panelClass: 'snack-error' });
        },
      });
      return;
    }

    const house = this.houseRefs.find(h => h.id === row.id);
    if (!house) {
      this.joined.emit();
      this.router.navigate(['/room', row.id]);
      return;
    }
    if (house.access === 'CLOSED') {
      this.snack.open('Cette maison est fermée.', 'OK', { duration: 3000, panelClass: 'snack-info' });
      return;
    }
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
          this.loadData();
          this.snack.open(`Maison "${created.name}" créée !`, 'OK', { duration: 3000, panelClass: 'snack-success' });
        }
      });
  }
}

function toRoomRow(r: RoomInfo): Row {
  return { id: r.id, name: r.name, owner: 'Toon-City', users: `${r.userCount ?? 0}/${r.maxUsers ?? '?'}`, access: 'OPEN', type: 'room' };
}

function toHouseRow(h: HouseInfo): Row {
  return { id: h.id, name: h.name, owner: h.ownerUsername ?? '—', users: `${h.userCount ?? 0}/${h.maxUsers ?? '?'}`, access: h.access, type: 'house' };
}
