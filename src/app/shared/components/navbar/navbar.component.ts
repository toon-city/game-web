import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-navbar',
  standalone: true,
  template: `
    <nav class="navbar" aria-label="Navigation principale">
      <img src="assets/images/navbar/accueil.png" alt="Accueil" class="nav-icon" (click)="accueil.emit()" role="button" tabindex="0" />
      <button class="nav-btn" type="button" (click)="navigateur.emit()">Navigateur</button>
      <button class="nav-btn" type="button" (click)="inventaire.emit()">Inventaire</button>
    </nav>
  `,
  styles: [`
    :host { display: contents; }

    .navbar {
      position: fixed;
      right: 16px;
      bottom: 16px;
      display: flex;
      padding: 10px;
      gap: 8px;
      background: white;
      border: 2px solid #2b4a5a;
      border-radius: 11px;
      z-index: 150;
      align-items: center;
      box-shadow: 0 6px 20px rgba(0,0,0,0.15);
    }

    .nav-icon {
      height: 36px;
      width: auto;
      cursor: pointer;
      border-radius: 4px;
      transition: transform 0.15s;

      &:hover { transform: scale(1.1); }
    }

    .nav-btn {
      padding: 6px 14px;
      border: 2px solid #2b4a5a;
      border-radius: 8px;
      background: #fff;
      color: #2b4a5a;
      font-weight: 700;
      font-size: 13px;
      font-family: 'Nunito', sans-serif;
      cursor: pointer;

      &:hover { background: #e8f4f8; }
      &:focus { outline: none; box-shadow: 0 0 0 3px rgba(43, 74, 90, 0.12); }
    }
  `],
})
export class NavbarComponent {
  @Output() accueil = new EventEmitter<void>();
  @Output() navigateur = new EventEmitter<void>();
  @Output() inventaire = new EventEmitter<void>();
}
