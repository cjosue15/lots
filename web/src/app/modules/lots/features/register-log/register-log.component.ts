import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { firstValueFrom, forkJoin } from 'rxjs';
import { todayInPeru } from '../../../../shared/peru-date';
import { DateFieldComponent } from '../../../../shared/ui/date-field.component';
import {
  type CreateActionLog,
  FERTILIZER_RESULTS,
  type TemplateAction,
} from '../../models/action.model';
import { LotsService } from '../../services/lots.service';

/** Value of the "Otra acción" option in the action select. */
const OTHER = 'other';

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
  ],
  providers: [provideIcons({ lucideChevronLeft })],
  templateUrl: './register-log.component.html',
})
export class RegisterLogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly lotsService = inject(LotsService);

  /** Lot id from the route. */
  readonly id = input.required<string>();

  protected readonly data = rxResource({
    params: () => this.id(),
    stream: ({ params: id }) =>
      forkJoin({ lot: this.lotsService.getLot(id), template: this.lotsService.getTemplate() }),
  });

  protected readonly OTHER = OTHER;
  protected readonly fertilizerResults = Object.entries(FERTILIZER_RESULTS);
  protected readonly today = todayInPeru();
  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    actionId: ['', Validators.required],
    otherName: ['', Validators.maxLength(120)],
    otherPhaseId: [''],
    date: [this.today, Validators.required],
    product: [''],
    dose: [''],
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
    id === OTHER ? 'Otra acción' : (this.actionsById().get(id)?.name ?? '');
  protected readonly phaseLabel = (id: string) => {
    const phase = this.data.value()?.template.phases.find((p) => p.id === id);
    return phase ? `${phase.order}. ${phase.name}` : 'Sin fase';
  };
  protected readonly yesNoLabel = (value: string) => (value === 'yes' ? 'Sí' : value === 'no' ? 'No' : '');
  protected readonly fertilizerLabel = (value: string) =>
    FERTILIZER_RESULTS[value as keyof typeof FERTILIZER_RESULTS] ?? '';

  protected readonly isOther = computed(() => this.actionId() === OTHER);
  protected readonly detailType = computed(
    () => this.actionsById().get(this.actionId())?.detailType ?? 'NONE',
  );

  protected async submit(): Promise<void> {
    const cycle = this.data.value()?.lot.cycle;
    if (!cycle) return;

    const value = this.form.getRawValue();
    if (this.isOther() && !value.otherName.trim()) {
      this.form.controls.otherName.setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      await firstValueFrom(this.lotsService.createLog(cycle.id, this.buildBody()));
      toast.success('Registro guardado');
      await this.router.navigate(['/lots', this.id()]);
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

  /** Sends only the fields of the selected action; empty fields are left out. */
  private buildBody(): CreateActionLog {
    const v = this.form.getRawValue();
    const body: CreateActionLog = { date: v.date, notes: v.notes.trim() || undefined };

    if (this.isOther()) {
      body.name = v.otherName.trim();
      body.phaseId = v.otherPhaseId || undefined;
      return body;
    }

    body.actionId = v.actionId;
    const details: Record<string, unknown> = {};
    switch (this.detailType()) {
      case 'APPLICATION':
        details['product'] = v.product;
        details['dose'] = v.dose;
        break;
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
      ([, value]) => value !== '' && value !== undefined,
    );
    if (filled.length) body.details = Object.fromEntries(filled);
    return body;
  }
}
