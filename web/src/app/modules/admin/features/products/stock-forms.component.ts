import {
  Component,
  computed,
  Directive,
  inject,
  input,
  type OnInit,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { firstValueFrom } from 'rxjs';
import { todayInPeru } from '../../../../shared/peru-date';
import { DateFieldComponent } from '../../../../shared/ui/date-field.component';
import { DOSE_SYMBOLS, formatAmount } from '../../../lots/models/details';
import type { GreenhouseStock, ProductDetail } from '../../models/product-admin.model';
import { AdminService } from '../../services/admin.service';
import { showSaveError } from './show-save-error';

const FORM_IMPORTS = [
  ReactiveFormsModule,
  HlmButtonImports,
  HlmFieldImports,
  HlmInputImports,
  HlmSelectImports,
  HlmSpinnerImports,
  DateFieldComponent,
];

/**
 * The greenhouse picked in a stock form: the stock and start date shown are
 * that greenhouse's (PLAN §14). `initial` preselects one.
 */
@Directive()
abstract class GreenhouseStockForm implements OnInit {
  protected readonly fb = inject(FormBuilder).nonNullable;

  abstract readonly product: () => ProductDetail;
  abstract readonly initial: () => string | null;

  protected readonly greenhouseControl = this.fb.control('', Validators.required);
  private readonly greenhouseId = toSignal(this.greenhouseControl.valueChanges, {
    initialValue: '',
  });

  /** The picked greenhouse's stock, or null until one is picked. */
  protected readonly selected = computed<GreenhouseStock | null>(
    () => this.product().greenhouses.find((s) => s.greenhouse.id === this.greenhouseId()) ?? null,
  );
  /** Entries and adjustments can't go before the initial count there. */
  protected readonly minDate = computed(() => this.selected()?.initialDate ?? undefined);

  protected readonly greenhouseName = (id: string) =>
    this.product().greenhouses.find((s) => s.greenhouse.id === id)?.greenhouse.name ?? '';

  ngOnInit(): void {
    const initial = this.initial();
    if (initial) this.greenhouseControl.setValue(initial);
  }
}

/** "Ingresar stock": what arrived, at what price per unit, and when. */
@Component({
  selector: 'app-stock-entry-form',
  imports: FORM_IMPORTS,
  template: `
    @let unit = symbol();
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <hlm-field-group class="gap-4">
        <hlm-field>
          <label hlmFieldLabel for="entry-greenhouse">Invernadero</label>
          <hlm-select formControlName="greenhouseId" [itemToString]="greenhouseName">
            <hlm-select-trigger buttonId="entry-greenhouse" class="w-full">
              <hlm-select-value placeholder="Elige uno" />
            </hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              @for (s of product().greenhouses; track s.greenhouse.id) {
                <hlm-select-item [value]="s.greenhouse.id">{{ s.greenhouse.name }}</hlm-select-item>
              }
            </hlm-select-content>
          </hlm-select>
          <hlm-field-error validator="required">Elige el invernadero.</hlm-field-error>
        </hlm-field>
        <div class="grid gap-4 sm:grid-cols-2">
          <hlm-field>
            <label hlmFieldLabel for="entry-quantity">Cantidad que entró ({{ unit }})</label>
            <input
              hlmInput
              id="entry-quantity"
              type="number"
              inputmode="decimal"
              min="0"
              step="any"
              formControlName="quantity"
            />
            <hlm-field-error validator="required">Escribe la cantidad.</hlm-field-error>
            <hlm-field-error validator="min">Debe ser mayor que 0.</hlm-field-error>
          </hlm-field>
          <hlm-field>
            <label hlmFieldLabel for="entry-cost">Precio por {{ unit }} (S/)</label>
            <input
              hlmInput
              id="entry-cost"
              type="number"
              inputmode="decimal"
              min="0"
              step="any"
              formControlName="unitCost"
              placeholder="De la factura"
            />
            <hlm-field-error validator="required">Escribe el precio.</hlm-field-error>
            <hlm-field-error validator="min">Debe ser mayor que 0.</hlm-field-error>
          </hlm-field>
        </div>
        <hlm-field>
          <label hlmFieldLabel for="entry-date">Fecha</label>
          <app-date-field
            inputId="entry-date"
            formControlName="date"
            [min]="minDate()"
            [max]="today"
          />
        </hlm-field>
      </hlm-field-group>
      <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button hlmBtn type="button" variant="outline" (click)="cancelled.emit()">Cancelar</button>
        <button hlmBtn type="submit" [disabled]="saving()">
          @if (saving()) {
            <hlm-spinner class="size-4" aria-hidden="true" />
          }
          Ingresar stock
        </button>
      </div>
    </form>
  `,
})
export class StockEntryFormComponent extends GreenhouseStockForm {
  private readonly admin = inject(AdminService);

  readonly product = input.required<ProductDetail>();
  /** Greenhouse to preselect. */
  readonly initial = input<string | null>(null);
  readonly saved = output<ProductDetail>();
  readonly cancelled = output<void>();

  protected readonly today = todayInPeru();
  protected readonly saving = signal(false);
  protected readonly symbol = computed(() => DOSE_SYMBOLS[this.product().unit]);

  protected readonly form = this.fb.group({
    greenhouseId: this.greenhouseControl,
    quantity: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.0001)]),
    unitCost: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.0001)]),
    date: [this.today, Validators.required],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { greenhouseId, quantity, unitCost, date } = this.form.getRawValue();
    const product = this.product();
    this.saving.set(true);
    try {
      const detail = await firstValueFrom(
        this.admin.addStock(product.id, {
          greenhouseId,
          quantity: quantity!,
          unitCost: unitCost!,
          date,
        }),
      );
      toast.success(
        `Ingresaron ${formatAmount(quantity!, product.unit)} de ${product.name} a ${this.greenhouseName(greenhouseId)}`,
      );
      this.saved.emit(detail);
    } catch (error) {
      showSaveError(error);
    } finally {
      this.saving.set(false);
    }
  }
}

/** "Ajustar stock": the stock counted in a greenhouse; the difference is recorded. */
@Component({
  selector: 'app-stock-adjust-form',
  imports: [...FORM_IMPORTS, HlmTextareaImports],
  template: `
    @let unit = symbol();
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <hlm-field-group class="gap-4">
        <hlm-field>
          <label hlmFieldLabel for="adjust-greenhouse">Invernadero</label>
          <hlm-select formControlName="greenhouseId" [itemToString]="greenhouseName">
            <hlm-select-trigger buttonId="adjust-greenhouse" class="w-full">
              <hlm-select-value placeholder="Elige uno" />
            </hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              @for (s of product().greenhouses; track s.greenhouse.id) {
                <hlm-select-item [value]="s.greenhouse.id">{{ s.greenhouse.name }}</hlm-select-item>
              }
            </hlm-select-content>
          </hlm-select>
          <hlm-field-error validator="required">Elige el invernadero.</hlm-field-error>
        </hlm-field>
        @if (selected(); as s) {
          <p class="text-sm text-muted-foreground">
            La app tiene <strong class="font-medium text-foreground">{{ current() }}</strong> en
            {{ s.greenhouse.name }}. Escribe lo que contaste y se registrará la diferencia.
          </p>
        }
        <hlm-field>
          <label hlmFieldLabel for="adjust-counted">Stock contado ({{ unit }})</label>
          <input
            hlmInput
            id="adjust-counted"
            type="number"
            inputmode="decimal"
            step="any"
            formControlName="counted"
            aria-describedby="adjust-difference"
          />
          <p hlmFieldDescription id="adjust-difference" aria-live="polite">
            @if (difference(); as diff) {
              Se registrará un ajuste de {{ diff }}.
            }
          </p>
          <hlm-field-error validator="required">Escribe el stock contado.</hlm-field-error>
        </hlm-field>
        <hlm-field>
          <label hlmFieldLabel for="adjust-reason">Motivo</label>
          <textarea
            hlmTextarea
            id="adjust-reason"
            formControlName="reason"
            rows="2"
            placeholder="Por ejemplo, conteo mensual"
          ></textarea>
          <hlm-field-error validator="required">Escribe el motivo.</hlm-field-error>
        </hlm-field>
        <hlm-field>
          <label hlmFieldLabel for="adjust-date">Fecha del conteo</label>
          <app-date-field
            inputId="adjust-date"
            formControlName="date"
            [min]="minDate()"
            [max]="today"
          />
        </hlm-field>
      </hlm-field-group>
      <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button hlmBtn type="button" variant="outline" (click)="cancelled.emit()">Cancelar</button>
        <button hlmBtn type="submit" [disabled]="saving()">
          @if (saving()) {
            <hlm-spinner class="size-4" aria-hidden="true" />
          }
          Ajustar stock
        </button>
      </div>
    </form>
  `,
})
export class StockAdjustFormComponent extends GreenhouseStockForm {
  private readonly admin = inject(AdminService);

  readonly product = input.required<ProductDetail>();
  /** Greenhouse to preselect. */
  readonly initial = input<string | null>(null);
  readonly saved = output<ProductDetail>();
  readonly cancelled = output<void>();

  protected readonly today = todayInPeru();
  protected readonly saving = signal(false);
  protected readonly symbol = computed(() => DOSE_SYMBOLS[this.product().unit]);
  protected readonly current = computed(() =>
    formatAmount(this.selected()?.stock ?? 0, this.product().unit),
  );

  protected readonly form = this.fb.group({
    greenhouseId: this.greenhouseControl,
    counted: this.fb.control<number | null>(null, Validators.required),
    reason: ['', [Validators.required, Validators.maxLength(300)]],
    date: [this.today, Validators.required],
  });

  private readonly counted = toSignal(this.form.controls.counted.valueChanges, {
    initialValue: null,
  });

  /** "+0,5 L" or "−0,25 L", or null when nothing to adjust. */
  protected readonly difference = computed(() => {
    const counted = this.counted();
    const selected = this.selected();
    if (!selected || counted === null || Number.isNaN(counted)) return null;
    const diff = Math.round((counted - selected.stock) * 1e6) / 1e6;
    if (diff === 0) return null;
    const amount = formatAmount(Math.abs(diff), this.product().unit);
    return diff > 0 ? `+${amount}` : `−${amount}`;
  });

  protected async submit(): Promise<void> {
    if (!this.form.controls.reason.value.trim()) {
      this.form.controls.reason.setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { greenhouseId, counted, reason, date } = this.form.getRawValue();
    this.saving.set(true);
    try {
      const detail = await firstValueFrom(
        this.admin.adjustStock(this.product().id, {
          greenhouseId,
          counted: counted!,
          reason: reason.trim(),
          date,
        }),
      );
      toast.success(
        `Stock de ${this.greenhouseName(greenhouseId)} ajustado a ${formatAmount(counted!, detail.unit)}`,
      );
      this.saved.emit(detail);
    } catch (error) {
      showSaveError(error);
    } finally {
      this.saving.set(false);
    }
  }
}
