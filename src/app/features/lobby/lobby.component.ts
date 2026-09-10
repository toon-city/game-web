import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { JustMarriedPanelComponent } from './components/just-married-panel/just-married-panel.component';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [JustMarriedPanelComponent],
  templateUrl: './lobby.component.html',
  styleUrls: ['./lobby.component.scss'],
})
export class LobbyComponent {
  readonly auth = inject(AuthService);
}

