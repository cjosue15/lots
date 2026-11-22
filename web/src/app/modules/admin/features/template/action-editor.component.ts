import { Component, inject, input, OnInit, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import type { DetailType } from '../../../lots/models/lot.model';
import {
  type ActionInput,
  type AdminAction,
  type AdminPhase,
  DETAIL_TYPE_LABELS,
} from '../../models/admin.model';

/** Inline form to create an action or edit one (name, phase, extra fields). */
@Component({
  selector: 'app-action-editor',
  imports: [
    ReactiveFormsModule,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSelectImports,
    HlmSpinnerImports,
  ],
  host: { class: 'block' },
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
      <hlm-field>
        <label hlmFieldLabel [for]="idPrefix + '-name'">Nombre</label>
        <input hlmInput [id]="idPrefix + '-name'" formControlName="name" class="bg-card" />
        <hlm-field-error validator="required">Escribe el nombre de la acción.</hlm-field-error>
      </hlm-field>

      <div class="grid gap-4 sm:grid-cols-2">
        <hlm-field>
          <label hlmFieldLabel [for]="idPrefix + '-phase'">Fase</label>
          <hlm-select formControlName="phaseId" [itemToString]="phaseLabel">
            <hlm-select-trigger [buttonId]="idPrefix + '-phase'" class="w-full bg-card">
              <hlm-select-value />
            </hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              @for (phase of phases(); track phase.id) {
                <hlm-select-item [value]="phase.id"
                  >{{ phase.order }}. {{ phase.name }}</hlm-select-item
                >
              }
              <hlm-select-item value="">Acción general (sin fase)</hlm-select-item>
            </hlm-select-content>
          </hlm-select>
        </hlm-field>

        <hlm-field>
          <label hlmFieldLabel [for]="idPrefix + '-detail'">Campos extra</label>
          <hlm-select formControlName="detailType" [itemToString]="detailLabel">
            <hlm-select-trigger [buttonId]="idPrefix + '-detail'" class="w-full bg-card">
              <hlm-select-value />
            </hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              @for (type of detailTypes; track type[0]) {
                <hlm-select-item [value]="type[0]">{{ type[1] }}</hlm-select-item>
              }
            </hlm-select-content>
          </hlm-select>
        </hlm-field>
      </div>

      @if (action()?.logCount; as count) {
        <p class="text-sm text-muted-foreground">
          {{ count === 1 ? 'El registro que ya usa' : 'Los ' + count + ' registros que ya usan' }}
          esta acción conserva{{ count === 1 ? '' : 'n' }} su nombre y fase.
        </p>
      }

      <div class="flex flex-wrap items-center gap-2">
        <button hlmBtn type="submit" size="sm" [disabled]="saving()">
          @if (saving()) {
            <hlm-spinner aria-label="Guardando" />
          }
          {{ action() ? 'Guardar cambios' : 'Agregar acción' }}
        </button>
        <button hlmBtn type="button" variant="ghost" size="sm" (click)="cancelled.emit()">
          Cancelar
        </button>

        @if (action(); as action) {
          <button
            hlmBtn
            type="button"
            variant="ghost"
            size="sm"
            class="ml-auto"
            [class.text-destructive]="action.active"
            [disabled]="saving()"
            (click)="activeToggled.emit(!action.active)"
          >
            {{ action.active ? 'Desactivar acción' : 'Reactivar acción' }}
          </button>
        }
      </div>
    </form>
  `,
})
export class ActionEditorComponent implements OnInit {
  private readonly fb = inject(FormBuilder);

  /** The action to edit; leave empty to create one. */
  readonly action = input<AdminAction | null>(null);
  /** Phase preselected for a new action (`null` = general). */
  readonly phaseId = input<string | null>(null);
  readonly phases = input.required<AdminPhase[]>();
  readonly saving = input(false);

  readonly saved = output<ActionInput>();
  readonly cancelled = output<void>();
  readonly activeToggled = output<boolean>();

  protected readonly idPrefix = `action-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly detailTypes = Object.entries(DETAIL_TYPE_LABELS) as [DetailType, string][];

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    phaseId: [''],
    detailType: ['NONE' as DetailType],
  });

  protected readonly phaseLabel = (id: string) => {
    const phase = this.phases().find((p) => p.id === id);
    return phase ? `${phase.order}. ${phase.name}` : 'Acción general (sin fase)';
  };
  protected readonly detailLabel = (type: DetailType) => DETAIL_TYPE_LABELS[type] ?? '';

  ngOnInit(): void {
    const action = this.action();
    this.form.reset({
      name: action?.name ?? '',
      phaseId: (action ? action.phaseId : this.phaseId()) ?? '',
      detailType: action?.detailType ?? 'NONE',
    });
  }

  protected submit(): void {
    const { name, phaseId, detailType } = this.form.getRawValue();
    if (!name.trim()) this.form.controls.name.setErrors({ required: true });
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saved.emit({ name: name.trim(), phaseId: phaseId || null, detailType });
  }
}
