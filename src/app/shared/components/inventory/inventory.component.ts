import { Component, EventEmitter, Output, signal } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';

type InvFilter = 'TOUS' | 'MEUBLES' | 'VETEMENTS' | 'DIVERS';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [DragDropModule],
  templateUrl: './inventory.component.html',
  styleUrls: ['./inventory.component.scss'],
})
export class InventoryComponent {
  @Output() close = new EventEmitter<void>();

  filter = signal<InvFilter>('TOUS');
  readonly filters: InvFilter[] = ['TOUS', 'MEUBLES', 'VETEMENTS', 'DIVERS'];
  readonly emptyItems = Array.from({ length: 56 });
}
