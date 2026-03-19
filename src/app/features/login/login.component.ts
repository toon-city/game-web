import { Component, OnInit, signal } from '@angular/core';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
} from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NgClass } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

function passwordsMatch(group: AbstractControl) {
  const pw = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return pw && confirm && pw !== confirm ? { mismatch: true } : null;
}

export interface StatsResponse {
  onlineCount: number;
  registeredCount: number;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatInputModule,
    MatButtonModule,
    MatSnackBarModule,
    MatIconModule,
    MatProgressSpinnerModule,
    NgClass,
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  registerForm: FormGroup;

  loadingLogin = false;
  loadingRegister = false;
  hideLoginPw = true;
  hideRegisterPw = true;
  hideConfirmPw = true;

  mode = signal<'login' | 'register'>('login');
  animating = false;

  onlineCount = signal(0);
  registeredCount = signal(0);

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private snack: MatSnackBar,
    private http: HttpClient,
  ) {
    this.loginForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(32)]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });

    this.registerForm = this.fb.group(
      {
        username: [
          '',
          [
            Validators.required,
            Validators.minLength(2),
            Validators.maxLength(32),
            Validators.pattern(/^[a-zA-Z0-9_\-]+$/),
          ],
        ],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(64)]],
        confirmPassword: ['', Validators.required],
        gender: ['', Validators.required],
      },
      { validators: passwordsMatch },
    );
  }

  ngOnInit(): void {
    this.http.get<StatsResponse>(`${environment.apiUrl}/stats`).subscribe({
      next: (s) => {
        this.onlineCount.set(s.onlineCount);
        this.registeredCount.set(s.registeredCount);
      },
    });
  }

  switchMode(): void {
    if (this.animating) return;
    this.animating = true;
    this.mode.set(this.mode() === 'login' ? 'register' : 'login');
    setTimeout(() => { this.animating = false; }, 480);
  }

  submitLogin(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    this.loadingLogin = true;
    const { username, password } = this.loginForm.value;
    this.auth.login(username.trim(), password).subscribe({
      next: () => this.router.navigate(['/lobby']),
      error: (err: HttpErrorResponse) => {
        this.loadingLogin = false;
        const msg = err.error?.message || err.error?.detail || 'Connexion impossible';
        this.snack.open(msg, 'OK', { duration: 4000, panelClass: 'snack-error' });
      },
    });
  }

  submitRegister(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }
    this.loadingRegister = true;
    const { username, password, gender, email } = this.registerForm.value;
    this.auth.register(username.trim(), password, gender, email.trim()).subscribe({
      next: () => {
        this.snack.open('Compte créé ! Bienvenue 🎉', 'OK', { duration: 3000, panelClass: 'snack-success' });
        this.router.navigate(['/lobby']);
      },
      error: (err: HttpErrorResponse) => {
        this.loadingRegister = false;
        const msg = err.error?.message || err.error?.detail || 'Inscription impossible';
        this.snack.open(msg, 'OK', { duration: 4000, panelClass: 'snack-error' });
      },
    });
  }
}
