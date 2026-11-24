import { Component, input, output } from '@angular/core';
import {
  type FormControl,
  type FormGroup,
  type NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTrash2 } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import type { ProductInput } from '../models/action.model';
import { APPLICATION_METHODS, DOSE_UNITS } from '../models/details';
import type { ApplicationMethod, ApplicationProduct, DoseUnit } from '../models/lot.model';

export type ProductForm = FormGroup<{
  product: FormControl<string>;
  dose: FormControl<number | null>;
  doseUnit: FormControl<DoseUnit>;
  method: FormControl<ApplicationMethod | ''>;
}>;

/** One product row, empty or filled from a saved product. */
export function productForm(fb: NonNullableFormBuilder, value?: ApplicationProduct): ProductForm {
  return fb.group({
    product: [value?.product ?? '', Validators.maxLength(200)],
    dose: fb.control<number | null>(value?.dose ?? null, Validators.min(0.001)),
    doseUnit: fb.control<DoseUnit>(value?.doseUnit ?? 'ML'),
    method: fb.control<ApplicationMethod | ''>(value?.method ?? ''),
  });
}

/**
 * The row as the API expects it, or null when nothing was filled. A row with
 * a dose or a method but no name gets a `required` error on its name.
 */
export function readProduct(group: ProductForm): ProductInput | null {
  const { product, dose, doseUnit, method } = group.getRawValue();
  const name = product.trim();
  if (!name) {
    if (dose !== null || method) group.controls.product.setErrors({ required: true });
    return null;
  }
  return {
    product: name,
    ...(dose !== null && { dose, doseUnit }),
    ...(method && { method }),
  };
}

/** Name, dose with its unit, and how one product was applied. */
@Component({
  selector: 'app-product-fields',
  imports: [
    ReactiveFormsModule,
    NgIcon,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSelectImports,
  ],
  providers: [provideIcons({ lucideTrash2 })],
  template: `
    @let n = index() + 1;
    @let id = 'product-' + index();
    <fieldset [formGroup]="group()" class="rounded-lg border bg-card p-3">
      <legend class="sr-only">Producto {{ n }}</legend>
      <div class="mb-3 flex min-h-8 items-center justify-between gap-2">
        <span class="text-sm font-medium" aria-hidden="true">Producto {{ n }}</span>
        @if (removable()) {
          <button
            hlmBtn
            type="button"
            variant="ghost"
            size="icon-sm"
            [attr.aria-label]="'Quitar producto ' + n"
            (click)="remove.emit()"
          >
            <ng-icon name="lucideTrash2" size="16" aria-hidden="true" />
          </button>
        }
      </div>
      <hlm-field-group class="gap-4">
        <hlm-field>
          <label hlmFieldLabel [for]="id + '-name'">Nombre</label>
          <input
            hlmInput
            [id]="id + '-name'"
            formControlName="product"
            placeholder="Por ejemplo, Bayfolan"
          />
          <hlm-field-error validator="required">Escribe el nombre del producto.</hlm-field-error>
        </hlm-field>
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <hlm-field>
            <label hlmFieldLabel [for]="id + '-dose'">Dosis</label>
            <input
              hlmInput
              [id]="id + '-dose'"
              type="number"
              inputmode="decimal"
              min="0"
              step="any"
              formControlName="dose"
              placeholder="Por ejemplo, 250"
            />
            <hlm-field-error validator="min">Debe ser mayor que 0.</hlm-field-error>
          </hlm-field>
          <hlm-field>
            <label hlmFieldLabel [for]="id + '-unit'">Unidad</label>
            <hlm-select formControlName="doseUnit" [itemToString]="unitLabel">
              <hlm-select-trigger [buttonId]="id + '-unit'" class="w-full">
                <hlm-select-value />
              </hlm-select-trigger>
              <hlm-select-content *hlmSelectPortal>
                @for (option of units; track option[0]) {
                  <hlm-select-item [value]="option[0]">{{ option[1] }}</hlm-select-item>
                }
              </hlm-select-content>
            </hlm-select>
          </hlm-field>
        </div>
        <hlm-field>
          <label hlmFieldLabel [for]="id + '-method'">Forma de aplicación</label>
          <hlm-select formControlName="method" [itemToString]="methodLabel">
            <hlm-select-trigger [buttonId]="id + '-method'" class="w-full">
              <hlm-select-value placeholder="Sin indicar" />
            </hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              @for (option of methods; track option[0]) {
                <hlm-select-item [value]="option[0]">{{ option[1] }}</hlm-select-item>
              }
            </hlm-select-content>
          </hlm-select>
        </hlm-field>
      </hlm-field-group>
    </fieldset>
  `,
})
export class ProductFieldsComponent {
  readonly group = input.required<ProductForm>();
  /** Position in the list, from 0. */
  readonly index = input.required<number>();
  readonly removable = input(false);
  readonly remove = output<void>();

  protected readonly units = Object.entries(DOSE_UNITS);
  protected readonly methods = Object.entries(APPLICATION_METHODS);
  protected readonly unitLabel = (value: string) => DOSE_UNITS[value as DoseUnit] ?? '';
  protected readonly methodLabel = (value: string) =>
    APPLICATION_METHODS[value as ApplicationMethod] ?? '';
}
