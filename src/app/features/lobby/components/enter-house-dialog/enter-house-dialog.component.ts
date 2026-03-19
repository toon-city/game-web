import { Component, Inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { HouseService } from '../../../../core/services/house.service';
import { HouseInfo } from '@toon-live/game-types';
import { HttpErrorResponse } from '@angular/common/http';

export interface EnterHouseDialogData {
  house: HouseInfo;
}

@Component({
  selector: 'app-enter-house-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: './enter-house-dialog.component.html',
  styleUrls: ['./enter-house-dialog.component.scss'],
})
export class EnterHouseDialogComponent {
  form: FormGroup;
  loading = false;
  error: string | null = null;
  hidePassword = true;

  constructor(
    private fb: FormBuilder,
    private houseService: HouseService,
    private dialogRef: MatDialogRef<EnterHouseDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: EnterHouseDialogData,
  ) {
    this.form = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(1)]],
    });
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;
    this.error = null;
    this.houseService.enterHouse(this.data.house.id, this.form.value.password).subscribe({
      next: () => this.dialogRef.close(true),
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        this.error = err.error?.message || err.error?.detail || 'Mot de passe incorrect';
      },
    });
  }
}
