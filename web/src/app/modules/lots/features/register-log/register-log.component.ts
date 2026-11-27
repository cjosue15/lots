import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucidePlus } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { firstValueFrom, forkJoin, map, type Observable, switchMap, tap } from 'rxjs';
import { todayInPeru } from '../../../../shared/peru-date';
import { DateFieldComponent } from '../../../../shared/ui/date-field.component';
import {
  type ActionTemplate,
  type CreateActionLog,
  FERTILIZER_RESULTS,
  type ProductInput,
  type TemplateAction,
  type UpdateActionLog,
} from '../../models/action.model';
import {
  ProductFieldsComponent,
  productForm,
  readProduct,
} from '../../components/product-fields.component';
import type {
  ActionLogDetail,
  ApplicationProduct,
  DetailType,
  LotRef,
} from '../../models/lot.model';
import type { CatalogProduct } from '../../models/product.model';
import { LotsService } from '../../services/lots.service';

/** Value of the "Otra acción" option in the action select. */
const OTHER = 'other';

/** What the form needs, whether it creates a log or edits one. */
interface FormContext {
  lot: LotRef;
  cycle: { id: string; number: number; startDate: string; endDate: string | null } | null;
  template: ActionTemplate;
  /** Active catalog products with their stock, for APPLICATION actions. */
  products: CatalogProduct[];
  /** Only when editing. */
  log: ActionLogDetail | null;
}

@Component({
  selector: 'app-register-log',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSelectImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTextareaImports,
    DateFieldComponent,
    ProductFieldsComponent,
  ],
  providers: [provideIcons({ lucideChevronLeft, lucidePlus })],
  templateUrl: './register-log.component.html',
})
export class RegisterLogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly lotsService = inject(LotsService);

  /** Lot id: `/lots/:id/log` registers a new log. */
  readonly id = input<string>();
  /** Log id: `/logs/:logId/edit` edits an existing one. */
  readonly logId = input<string>();

  protected readonly isEdit = computed(() => !!this.logId());

  protected readonly data = rxResource({
    params: () => ({ lotId: this.id(), logId: this.logId() }),
    stream: ({ params }) => this.loadContext(params.lotId, params.logId),
  });

  /** Cancel / back target. */
  protected readonly backLink = computed(() =>
    this.logId() ? ['/logs', this.logId()] : ['/lots', this.id()],
  );

  /** Latest selectable day: today, or the closing day of a closed cycle. */
  protected readonly maxDate = computed(() => {
    const end = this.data.value()?.cycle?.endDate;
    return end && end < this.today ? end : this.today;
  });

  protected readonly OTHER = OTHER;
  protected readonly fertilizerResults = Object.entries(FERTILIZER_RESULTS);
  protected readonly today = todayInPeru();
  protected readonly saving = signal(false);
  /** Per row: the name typed on a log from before the catalog, if any. */
  protected readonly legacyNames = signal<(string | null)[]>([]);

  protected readonly form = this.fb.nonNullable.group({
    actionId: ['', Validators.required],
    otherName: ['', Validators.maxLength(120)],
    otherPhaseId: [''],
    date: [this.today, Validators.required],
    products: this.fb.nonNullable.array([productForm(this.fb.nonNullable)]),
    humidity: [''],
    result: [''],
    chemicalApplied: [''],
    fertilizerResult: [''],
    notes: [''],
  });

  private readonly actionId = toSignal(this.form.controls.actionId.valueChanges, {
    initialValue: '',
  });

  /** All template actions by id, to know the detail type of the selection. */
  private readonly actionsById = computed(() => {
    const template = this.data.value()?.template;
    const map = new Map<string, TemplateAction>();
    for (const action of [
      ...(template?.phases.flatMap((phase) => phase.actions) ?? []),
      ...(template?.general ?? []),
    ]) {
      map.set(action.id, action);
    }
    return map;
  });

  /** Labels shown in the select triggers (the form stores ids). */
  protected readonly actionLabel = (id: string) =>
    id === OTHER
      ? 'Otra acción'
      : (this.actionsById().get(id)?.name ?? this.data.value()?.log?.name ?? '');
  protected readonly phaseLabel = (id: string) => {
    const phase = this.data.value()?.template.phases.find((p) => p.id === id);
    return phase ? `${phase.order}. ${phase.name}` : 'Sin fase';
  };
  /** Soil moisture, 0% to 100% in steps of 5. */
  protected readonly humidityOptions = Array.from({ length: 21 }, (_, i) => `${i * 5}%`);
  protected readonly humidityLabel = (value: string) => value;
  protected readonly yesNoLabel = (value: string) => (value === 'yes' ? 'Sí' : value === 'no' ? 'No' : '');
  protected readonly fertilizerLabel = (value: string) =>
    FERTILIZER_RESULTS[value as keyof typeof FERTILIZER_RESULTS] ?? '';

  protected readonly isOther = computed(() => this.actionId() === OTHER);
  protected readonly detailType = computed<DetailType>(
    () =>
      this.actionsById().get(this.actionId())?.detailType ??
      this.data.value()?.log?.detailType ??
      'NONE',
  );

  protected addProduct(): void {
    this.form.controls.products.push(productForm(this.fb.nonNullable));
  }

  protected removeProduct(index: number): void {
    this.form.controls.products.removeAt(index);
    this.legacyNames.update((names) => names.filter((_, i) => i !== index));
  }

  protected async submit(): Promise<void> {
    const ctx = this.data.value();
    if (!ctx?.cycle) return;

    const value = this.form.getRawValue();
    if (this.isOther() && !value.otherName.trim()) {
      this.form.controls.otherName.setErrors({ required: true });
    }
    // Also flags rows with a quantity or a method but no product.
    const products = this.readProducts();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      if (ctx.log) {
        await firstValueFrom(
          this.lotsService.updateLog(ctx.log.id, this.buildUpdate(products)),
        );
        toast.success('Cambios guardados');
        await this.router.navigate(['/logs', ctx.log.id]);
      } else {
        await firstValueFrom(this.lotsService.createLog(ctx.cycle.id, this.buildBody(products)));
        toast.success('Registro guardado');
        await this.router.navigate(['/lots', ctx.lot.id]);
      }
    } catch (error) {
      if (error instanceof HttpErrorResponse && [400, 409].includes(error.status)) {
        const message = error.error?.message;
        toast.error(Array.isArray(message) ? message.join('. ') : (message ?? 'Revisa los datos'));
      } else if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        toast.error('No se pudo guardar el registro. Inténtalo de nuevo.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  private loadContext(lotId?: string, logId?: string): Observable<FormContext> {
    const template = this.lotsService.getTemplate();
    if (logId) {
      // The stock shown is the lot's greenhouse's, so products wait for the log's lot.
      return forkJoin({ log: this.lotsService.getLog(logId), template }).pipe(
        switchMap(({ log, template }) =>
          this.lotsService.getProducts(log.lot.id).pipe(map((products) => ({ log, template, products }))),
        ),
        map(({ log, template, products }) => ({
          lot: log.lot,
          cycle: log.cycle,
          template,
          products,
          log,
        })),
        tap(({ log }) => this.fillForm(log)),
      );
    }
    const products = this.lotsService.getProducts(lotId!);
    return forkJoin({ lot: this.lotsService.getLot(lotId!), template, products }).pipe(
      map(({ lot, template, products }) => ({
        lot: { id: lot.id, number: lot.number, greenhouse: lot.greenhouse },
        cycle: lot.cycle ? { ...lot.cycle, endDate: null } : null,
        template,
        products,
        log: null,
      })),
    );
  }

  /** Loads an existing log into the form. The action itself can't change. */
  private fillForm(log: ActionLogDetail): void {
    const details = log.details ?? {};
    const text = (key: string) => (typeof details[key] === 'string' ? (details[key] as string) : '');
    const chemical = details['chemicalApplied'];

    this.form.reset({
      actionId: log.actionId ?? OTHER,
      otherName: log.actionId ? '' : log.name,
      otherPhaseId: log.actionId ? '' : (log.phase?.id ?? ''),
      date: log.date,
      humidity: text('humidity'),
      result: log.detailType === 'PEST_CHECK' ? text('result') : '',
      chemicalApplied: typeof chemical === 'boolean' ? (chemical ? 'yes' : 'no') : '',
      fertilizerResult: log.detailType === 'FERTILIZER_EVAL' ? text('result') : '',
      notes: log.notes ?? '',
    });
    const products = log.products.length ? log.products : this.legacyProduct(details);
    this.legacyNames.set(products.map((p) => (p.productId ? null : p.product)));
    this.form.setControl(
      'products',
      this.fb.nonNullable.array(
        (products.length ? products : [undefined]).map((p) => productForm(this.fb.nonNullable, p)),
      ),
    );
    this.form.controls.actionId.disable();
  }

  /**
   * Logs saved before products had their own table kept one product in
   * `details`. Editing one moves it into the list (and out of `details`).
   */
  private legacyProduct(details: Record<string, unknown>): ApplicationProduct[] {
    const { product, dose, doseUnit, method } = details;
    if (typeof product !== 'string' || !product) return [];
    const amount = typeof dose === 'number' ? dose : Number.parseFloat(String(dose ?? '').replace(',', '.'));
    return [
      {
        productId: null,
        product,
        dose: Number.isFinite(amount) && amount > 0 ? amount : null,
        doseUnit: doseUnit === 'MG' ? 'MG' : 'ML',
        method: method === 'SYSTEM' || method === 'SPRAY' ? method : null,
      },
    ];
  }

  /** Filled product rows, in order; empty rows are skipped. */
  private readProducts(): ProductInput[] {
    if (this.detailType() !== 'APPLICATION') return [];
    return this.form.controls.products.controls
      .map(readProduct)
      .filter((p): p is ProductInput => p !== null);
  }

  /** PATCH body: every editable field, `null` clears it. */
  private buildUpdate(products: ProductInput[]): UpdateActionLog {
    const v = this.form.getRawValue();
    const body: UpdateActionLog = { date: v.date, notes: v.notes.trim() || null };
    if (this.isOther()) {
      body.name = v.otherName.trim();
      body.phaseId = v.otherPhaseId || null;
    } else if (this.detailType() !== 'NONE') {
      body.details = this.buildDetails() ?? null;
      if (this.detailType() === 'APPLICATION') body.products = products;
    }
    return body;
  }

  /** Sends only the fields of the selected action; empty fields are left out. */
  private buildBody(products: ProductInput[]): CreateActionLog {
    const v = this.form.getRawValue();
    const body: CreateActionLog = { date: v.date, notes: v.notes.trim() || undefined };

    if (this.isOther()) {
      body.name = v.otherName.trim();
      body.phaseId = v.otherPhaseId || undefined;
      return body;
    }

    body.actionId = v.actionId;
    body.details = this.buildDetails();
    if (products.length) body.products = products;
    return body;
  }

  /** Fields of the selected action's detail type; `undefined` when none was filled. */
  private buildDetails(): Record<string, unknown> | undefined {
    const v = this.form.getRawValue();
    const details: Record<string, unknown> = {};
    switch (this.detailType()) {
      case 'IRRIGATION':
        details['humidity'] = v.humidity;
        break;
      case 'PEST_CHECK':
        details['result'] = v.result;
        if (v.chemicalApplied) details['chemicalApplied'] = v.chemicalApplied === 'yes';
        break;
      case 'FERTILIZER_EVAL':
        if (v.fertilizerResult) details['result'] = v.fertilizerResult;
        break;
    }
    const filled = Object.entries(details).filter(
      ([, value]) => typeof value !== 'string' || value.trim() !== '',
    );
    return filled.length ? Object.fromEntries(filled) : undefined;
  }
}
