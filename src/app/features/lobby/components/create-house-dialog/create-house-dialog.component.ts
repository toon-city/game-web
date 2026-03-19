import { Component, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { HouseService, HouseCreateRequest } from '../../../../core/services/house.service';
import { HouseSchema } from '@toon-live/game-types';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-create-house-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatRadioModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: './create-house-dialog.component.html',
  styleUrls: ['./create-house-dialog.component.scss'],
})
export class CreateHouseDialogComponent implements OnInit {
  form: FormGroup;
  schemas: HouseSchema[] = [];
  loading = false;
  loadingSchemas = true;
  error: string | null = null;
  hidePassword = true;

  constructor(
    private fb: FormBuilder,
    private houseService: HouseService,
    private dialogRef: MatDialogRef<CreateHouseDialogComponent>,
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(64)]],
      schemaId: [null, Validators.required],
      access: ['OPEN', Validators.required],
      password: [''],
    });

    this.form.get('access')!.valueChanges.subscribe((v) => {
      const ctrl = this.form.get('password')!;
      if (v === 'PASSWORD') {
        ctrl.setValidators([Validators.required, Validators.minLength(3)]);
      } else {
        ctrl.clearValidators();
        ctrl.setValue('');
      }
      ctrl.updateValueAndValidity();
    });
  }

  ngOnInit(): void {
    this.houseService.listSchemas().subscribe({
      next: (s) => { this.schemas = s; this.loadingSchemas = false; },
      error: () => { this.loadingSchemas = false; },
    });
  }

  get accessValue() { return this.form.get('access')!.value; }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;
    this.error = null;
    const { name, schemaId, access, password } = this.form.value;
    const req: HouseCreateRequest = { name, schemaId, access, ...(access === 'PASSWORD' ? { password } : {}) };
    this.houseService.createHouse(req).subscribe({
      next: (house) => this.dialogRef.close(house),
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        this.error = err.error?.message || err.error?.detail || 'Erreur lors de la création';
      },
    });
  }
}
