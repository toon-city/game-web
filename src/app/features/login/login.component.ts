import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, MatCardModule, MatInputModule, MatButtonModule, MatSnackBarModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  username = '';
  loading = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private snack: MatSnackBar,
  ) {}

  submit(): void {
    if (!this.username.trim()) return;
    this.loading = true;
    this.auth.login(this.username.trim()).subscribe({
      next: () => this.router.navigate(['/lobby']),
      error: () => {
        this.loading = false;
        this.snack.open('Connexion impossible', 'OK', { duration: 3000 });
      },
    });
  }
}
