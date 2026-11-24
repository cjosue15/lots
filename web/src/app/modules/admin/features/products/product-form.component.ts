import { Component, computed, inject, input, type OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { firstValueFrom } from 'rxjs';
import { todayInPeru } from '../../../../shared/peru-date';
import { DateFieldComponent } from '../../../../shared/ui/date-field.component';
import type { DoseUnit } from '../../../lots/models/lot.model';
import { DOSE_SYMBOLS } from '../../../lots/models/details';
import {
  type AdminCategory,
  type ProductDetail,
  STOCK_UNITS,
} from '../../models/product-admin.model';
import { AdminService } from '../../services/admin.service';
import { showSaveError } from './show-save-error';

/**
 * Creates a product with its initial count, or edits name, category and
 * minimum of an existing one (the unit and the initial stock are fixed).
 */
@Component({
  selector: 'app-product-form',
  imports: [
    ReactiveFormsModule,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSelectImports,
    HlmSpinnerImports,
    DateFieldComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <hlm-field-group class="gap-4">
        <hlm-field>
          <label hlmFieldLabel for="product-name">Nombre</label>
          <input
            hlmInput
            id="product-name"
            formControlName="name"
            placeholder="Por ejemplo, Bayfolan"
          />
          <hlm-field-error validator="required">Escribe el nombre.</hlm-field-error>
        </hlm-field>

        <div class="grid gap-4 sm:grid-cols-2">
          <hlm-field>
            <label hlmFieldLabel for="product-category">Categoría</label>
            <hlm-select formControlName="categoryId" [itemToString]="categoryName">
              <hlm-select-trigger buttonId="product-category" class="w-full">
                <hlm-select-value placeholder="Elige una" />
              </hlm-select-trigger>
              <hlm-select-content *hlmSelectPortal>
                @for (category of activeCategories(); track category.id) {
                  <hlm-select-item [value]="category.id">{{ category.name }}</hlm-select-item>
                }
              </hlm-select-content>
            </hlm-select>
            <hlm-field-error validator="required">Elige la categoría.</hlm-field-error>
          </hlm-field>

          <hlm-field>
            <label hlmFieldLabel for="product-unit">Se mide en</label>
            @if (product(); as current) {
              <input hlmInput id="product-unit" [value]="unitLabel(current.unit)" disabled />
              <p hlmFieldDescription>No se cambia: el historial está en esta unidad.</p>
            } @else {
              <hlm-select formControlName="unit" [itemToString]="unitLabel">
                <hlm-select-trigger buttonId="product-unit" class="w-full">
                  <hlm-select-value />
                </hlm-select-trigger>
                <hlm-select-content *hlmSelectPortal>
                  @for (unit of units; track unit[0]) {
                    <hlm-select-item [value]="unit[0]">{{ unit[1] }}</hlm-select-item>
                  }
                </hlm-select-content>
              </hlm-select>
            }
          </hlm-field>
        </div>

        <hlm-field>
          <label hlmFieldLabel for="product-min">Stock mínimo ({{ symbol() }})</label>
          <input
            hlmInput
            id="product-min"
            type="number"
            inputmode="decimal"
            min="0"
            step="any"
            formControlName="minStock"
          />
          <p hlmFieldDescription>Por debajo de este stock el producto se marca en alerta.</p>
          <hlm-field-error validator="min">No puede ser negativo.</hlm-field-error>
        </hlm-field>

        @if (!product()) {
          <fieldset class="grid gap-4 rounded-lg bg-muted/60 p-4 sm:grid-cols-2">
            <legend class="float-left mb-1 text-sm font-medium sm:col-span-2">
              Stock inicial (lo que hay hoy en el almacén)
            </legend>
            <hlm-field>
              <label hlmFieldLabel for="product-initial">Cantidad ({{ symbol() }})</label>
              <input
                hlmInput
                id="product-initial"
                type="number"
                inputmode="decimal"
                min="0"
                step="any"
                formControlName="initialStock"
                class="bg-card"
              />
              <hlm-field-error validator="required"
                >Escribe la cantidad (0 si no hay).</hlm-field-error
              >
              <hlm-field-error validator="min">No puede ser negativa.</hlm-field-error>
            </hlm-field>
            <hlm-field>
              <label hlmFieldLabel for="product-cost">Precio por {{ symbol() }} (S/)</label>
              <input
                hlmInput
                id="product-cost"
                type="number"
                inputmode="decimal"
                min="0"
                step="any"
                formControlName="unitCost"
                placeholder="De la última factura"
                class="bg-card"
              />
              <hlm-field-error validator="required">Escribe el precio.</hlm-field-error>
              <hlm-field-error validator="min">Debe ser mayor que 0.</hlm-field-error>
            </hlm-field>
            <hlm-field class="sm:col-span-2">
              <label hlmFieldLabel for="product-date">Fecha del conteo</label>
              <app-date-field inputId="product-date" formControlName="date" [max]="today" />
              <p hlmFieldDescription>
                Las aplicaciones anteriores a esta fecha no descuentan de este stock.
              </p>
            </hlm-field>
          </fieldset>
        }
      </hlm-field-group>

      <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button hlmBtn type="button" variant="outline" (click)="cancelled.emit()">Cancelar</button>
        <button hlmBtn type="submit" [disabled]="saving()">
          @if (saving()) {
            <hlm-spinner class="size-4" aria-hidden="true" />
          }
          {{ product() ? 'Guardar cambios' : 'Crear producto' }}
        </button>
      </div>
    </form>
  `,
})
export class ProductFormComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly categories = input.required<AdminCategory[]>();
  /** Set when editing. */
  readonly product = input<ProductDetail | null>(null);
  readonly saved = output<ProductDetail>();
  readonly cancelled = output<void>();

  protected readonly today = todayInPeru();
  protected readonly saving = signal(false);
  protected readonly units = Object.entries(STOCK_UNITS);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    categoryId: ['', Validators.required],
    unit: this.fb.control<DoseUnit>('L'),
    minStock: this.fb.control<number | null>(0, Validators.min(0)),
    initialStock: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    unitCost: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.0001)]),
    date: [this.today, Validators.required],
  });

  private readonly unit = signal<DoseUnit>('L');
  protected readonly symbol = computed(() => DOSE_SYMBOLS[this.product()?.unit ?? this.unit()]);

  protected readonly activeCategories = computed(() =>
    this.categories().filter(
      (category) => category.active || category.id === this.product()?.category.id,
    ),
  );
  protected readonly categoryName = (id: string) =>
    this.categories().find((category) => category.id === id)?.name ?? '';
  protected readonly unitLabel = (unit: string) => STOCK_UNITS[unit as DoseUnit] ?? '';

  constructor() {
    this.form.controls.unit.valueChanges.subscribe((unit) => this.unit.set(unit));
  }

  ngOnInit(): void {
    const product = this.product();
    if (!product) return;
    this.form.patchValue({
      name: product.name,
      categoryId: product.category.id,
      minStock: product.minStock,
    });
    // The initial count is only asked when creating.
    for (const control of ['unit', 'initialStock', 'unitCost', 'date'] as const) {
      this.form.controls[control].disable();
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const current = this.product();
    this.saving.set(true);
    try {
      const detail = await firstValueFrom(
        current
          ? this.admin.updateProduct(current.id, {
              name: v.name.trim(),
              categoryId: v.categoryId,
              minStock: v.minStock ?? 0,
            })
          : this.admin.createProduct({
              name: v.name.trim(),
              categoryId: v.categoryId,
              unit: v.unit,
              minStock: v.minStock ?? 0,
              initialStock: v.initialStock!,
              unitCost: v.unitCost!,
              date: v.date,
            }),
      );
      toast.success(current ? 'Cambios guardados' : `${detail.name} creado`);
      this.saved.emit(detail);
    } catch (error) {
      showSaveError(error);
    } finally {
      this.saving.set(false);
    }
  }
}
