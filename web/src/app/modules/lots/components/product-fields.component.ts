import { Component, computed, effect, input, output } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
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
import { HlmComboboxImports } from '@spartan-ng/helm/combobox';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { map, startWith, switchMap } from 'rxjs';
import type { ProductInput } from '../models/action.model';
import { APPLICATION_METHODS, DOSE_UNITS, formatAmount, unitsLike } from '../models/details';
import type { ApplicationMethod, ApplicationProduct, DoseUnit } from '../models/lot.model';
import type { CatalogProduct } from '../models/product.model';

export type ProductForm = FormGroup<{
  productId: FormControl<string>;
  dose: FormControl<number | null>;
  doseUnit: FormControl<DoseUnit>;
  method: FormControl<ApplicationMethod | ''>;
}>;

/** Unit the quantity starts in for a product measured in `unit`. */
const DEFAULT_DOSE_UNIT: Record<DoseUnit, DoseUnit> = {
  L: 'ML',
  ML: 'ML',
  KG: 'G',
  G: 'G',
  MG: 'MG',
};

/** One product row, empty or filled from a saved product. */
export function productForm(fb: NonNullableFormBuilder, value?: ApplicationProduct): ProductForm {
  return fb.group({
    productId: [value?.productId ?? ''],
    dose: fb.control<number | null>(value?.dose ?? null, Validators.min(0.001)),
    doseUnit: fb.control<DoseUnit>(value?.doseUnit ?? 'ML'),
    method: fb.control<ApplicationMethod | ''>(value?.method ?? ''),
  });
}

/**
 * The row as the API expects it, or null when nothing was filled. A row with
 * a quantity or a method but no product gets a `required` error on the product.
 */
export function readProduct(group: ProductForm): ProductInput | null {
  const { productId, dose, doseUnit, method } = group.getRawValue();
  if (!productId) {
    if (dose !== null || method) group.controls.productId.setErrors({ required: true });
    return null;
  }
  return {
    productId,
    ...(dose !== null && { dose, doseUnit }),
    ...(method && { method }),
  };
}

/** Product from the catalog, quantity used with its unit, and how it was applied. */
@Component({
  selector: 'app-product-fields',
  imports: [
    ReactiveFormsModule,
    NgIcon,
    HlmButtonImports,
    HlmComboboxImports,
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
          <label hlmFieldLabel [for]="id + '-name'">Producto</label>
          <hlm-combobox formControlName="productId" [itemToString]="productName">
            <hlm-combobox-input
              [inputId]="id + '-name'"
              placeholder="Busca por nombre"
              triggerAriaLabel="Ver productos"
            />
            <hlm-combobox-content *hlmComboboxPortal>
              <hlm-combobox-empty>Ningún producto coincide.</hlm-combobox-empty>
              <div hlmComboboxList aria-label="Productos">
                @for (category of categories(); track category.name) {
                  <div hlmComboboxGroup>
                    <div hlmComboboxLabel>{{ category.name }}</div>
                    @for (product of category.products; track product.id) {
                      <hlm-combobox-item [value]="product.id">
                        <span class="truncate">{{ product.name }}</span>
                        <span
                          class="ms-auto shrink-0 text-xs tabular-nums"
                          [class]="product.stock > 0 ? 'text-muted-foreground' : 'text-destructive'"
                        >
                          {{ product.stock > 0 ? stockLabel(product) : 'Sin stock' }}
                        </span>
                      </hlm-combobox-item>
                    }
                  </div>
                }
              </div>
            </hlm-combobox-content>
          </hlm-combobox>
          @if (selected(); as product) {
            <p hlmFieldDescription [class.text-destructive]="product.stock <= 0">
              @if (product.stock > 0) {
                Quedan {{ stockLabel(product) }} en {{ greenhouse() }}.
              } @else {
                Sin stock en {{ greenhouse() }}. Puedes registrarlo igual; el administrador lo revisará.
              }
            </p>
          } @else if (legacyName()) {
            <p hlmFieldDescription>Antes se escribió «{{ legacyName() }}». Elígelo del catálogo.</p>
          }
          <hlm-field-error validator="required">Elige el producto.</hlm-field-error>
        </hlm-field>
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <hlm-field>
            <label hlmFieldLabel [for]="id + '-dose'">Cantidad usada</label>
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
                @for (unit of units(); track unit) {
                  <hlm-select-item [value]="unit">{{ unitLabel(unit) }}</hlm-select-item>
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
  /** Active catalog products, sorted by category and name. */
  readonly products = input.required<CatalogProduct[]>();
  /** Name of the lot's greenhouse: the stock shown is the one there. */
  readonly greenhouse = input.required<string>();
  /** Name typed on a log from before the catalog, shown until a product is picked. */
  readonly legacyName = input<string | null>(null);
  readonly removable = input(false);
  readonly remove = output<void>();

  private readonly productId = toSignal(
    toObservable(this.group).pipe(
      switchMap((group) =>
        group.controls.productId.valueChanges.pipe(
          startWith(group.controls.productId.value),
          map(() => group.controls.productId.value),
        ),
      ),
    ),
    { initialValue: '' },
  );

  private readonly byId = computed(
    () => new Map(this.products().map((product) => [product.id, product])),
  );

  protected readonly selected = computed(() => this.byId().get(this.productId()));

  protected readonly categories = computed(() => {
    const groups = new Map<string, CatalogProduct[]>();
    for (const product of this.products()) {
      groups.set(product.category.name, [...(groups.get(product.category.name) ?? []), product]);
    }
    return [...groups].map(([name, products]) => ({ name, products }));
  });

  /** Only units of the product's kind; volume until a product is picked. */
  protected readonly units = computed(() => unitsLike(this.selected()?.unit ?? 'ML'));

  protected readonly methods = Object.entries(APPLICATION_METHODS);
  protected readonly productName = (id: string) => this.byId().get(id)?.name ?? '';
  protected readonly unitLabel = (value: string) => DOSE_UNITS[value as DoseUnit] ?? '';
  protected readonly methodLabel = (value: string) =>
    APPLICATION_METHODS[value as ApplicationMethod] ?? '';
  protected readonly stockLabel = (product: CatalogProduct) =>
    formatAmount(product.stock, product.unit);

  constructor() {
    // Picking a product of the other kind (volume vs weight) moves the unit to one of its own.
    effect(() => {
      const product = this.selected();
      const unit = this.group().controls.doseUnit;
      if (product && !unitsLike(product.unit).includes(unit.value)) {
        unit.setValue(DEFAULT_DOSE_UNIT[product.unit]);
      }
    });
  }
}
