import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { SocketService } from './core/services/socket.service';
import { CloudsBgComponent } from './shared/components/clouds-bg/clouds-bg.component';
import { IdentityCardComponent } from './shared/components/identity-card/identity-card.component';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { NavigatorComponent } from './shared/components/navigator/navigator.component';
import { InventoryComponent } from './shared/components/inventory/inventory.component';
import { GameMenuComponent } from './shared/components/game-menu/game-menu.component';
import { ChatComponent } from './features/game/components/chat/chat.component';
import { StatusBarComponent } from './shared/components/status-bar/status-bar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    CloudsBgComponent,
    IdentityCardComponent,
    NavbarComponent,
    NavigatorComponent,
    InventoryComponent,
    GameMenuComponent,
    ChatComponent,
    StatusBarComponent,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  readonly socket = inject(SocketService);

  navOpen = signal(false);
  invOpen = signal(false);

  readonly inRoom = computed(() => this.socket.roomState() !== null);
  readonly roomId = computed(() => this.socket.roomState()?.roomId ?? '');

  toggleNav(): void { this.navOpen.update(v => !v); }
  toggleInv(): void { this.invOpen.update(v => !v); }
  goHome(): void { this.router.navigate(['/lobby']); }

  ngOnInit(): void {
    // Rafraîchit kreds/pez depuis le serveur si la session est active
    this.auth.refreshUser();
  }

  navigatorJoined(): void {
    this.navOpen.set(false);
  }
}

