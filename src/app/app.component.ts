import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from './core/services/auth.service';
import { SocketService } from './core/services/socket.service';
import { CloudsBgComponent } from './shared/components/clouds-bg/clouds-bg.component';
import { IdentityCardComponent } from './shared/components/identity-card/identity-card.component';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { NavigatorComponent } from './shared/components/navigator/navigator.component';
import { InventoryComponent } from './shared/components/inventory/inventory.component';
import { ShopComponent } from './shared/components/shop/shop.component';
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
    ShopComponent,
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

  navOpen  = signal(false);
  invOpen  = signal(false);
  shopOpen = signal(false);

  readonly inRoom = computed(() => this.socket.roomState() !== null);
  readonly roomId = computed(() => this.socket.roomState()?.roomId ?? '');

  toggleNav():  void { this.navOpen.update(v => !v); }
  toggleInv():  void { this.invOpen.update(v => !v); }
  toggleShop(): void { this.shopOpen.update(v => !v); }
  goHome():     void { this.router.navigate(['/lobby']); }

  ngOnInit(): void {
    // Rafraîchit kreds/pez depuis le serveur si la session est active
    this.auth.refreshUser();
    // Re-sync à chaque changement de page
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
    ).subscribe(() => this.auth.refreshUser());
  }

  navigatorJoined(): void {
    this.navOpen.set(false);
  }
}

