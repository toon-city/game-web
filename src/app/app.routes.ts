import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'lobby',
    loadComponent: () =>
      import('./features/lobby/lobby.component').then((m) => m.LobbyComponent),
    canActivate: [authGuard],
  },
  {
    path: 'room/:roomId',
    loadComponent: () =>
      import('./features/game/game.component').then((m) => m.GameComponent),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: 'login' },
];
