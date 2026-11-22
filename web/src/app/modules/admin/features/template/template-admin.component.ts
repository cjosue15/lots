import { HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowDown, lucideArrowUp, lucidePencil, lucidePlus } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { firstValueFrom, type Observable } from 'rxjs';
import {
  type ActionInput,
  type AdminAction,
  type AdminPhase,
  type AdminTemplate,
  DETAIL_TYPE_LABELS,
} from '../../models/admin.model';
import { LotsService } from '../../../lots/services/lots.service';
import { AdminService } from '../../services/admin.service';
import { ActionEditorComponent } from './action-editor.component';

/** What is open for editing; only one thing at a time. */
type Editing =
  | { kind: 'phase'; id: string }
  | { kind: 'action'; id: string }
  | { kind: 'new'; phaseId: string | null };

@Component({
  selector: 'app-template-admin',
  imports: [
    NgTemplateOutlet,
    NgIcon,
    HlmButtonImports,
    HlmInputImports,
    HlmSkeletonImports,
    ActionEditorComponent,
  ],
  providers: [provideIcons({ lucideArrowDown, lucideArrowUp, lucidePencil, lucidePlus })],
  templateUrl: './template-admin.component.html',
})
export class TemplateAdminComponent {
  private readonly admin = inject(AdminService);
  private readonly lotsService = inject(LotsService);

  protected readonly template = rxResource({ stream: () => this.admin.getTemplate() });
  protected readonly editing = signal<Editing | null>(null);
  protected readonly saving = signal(false);

  /** Types the `ng-template` context (shared by phase groups and general actions). */
  protected asActions(actions: unknown): AdminAction[] {
    return actions as AdminAction[];
  }

  /** Secondary line: extra fields (if any) and how many logs use the action. */
  protected summary(action: AdminAction): string {
    const uses =
      action.logCount === 0
        ? 'Sin registros'
        : action.logCount === 1
          ? '1 registro'
          : `${action.logCount} registros`;
    return action.detailType === 'NONE'
      ? uses
      : `${DETAIL_TYPE_LABELS[action.detailType]}. ${uses}`;
  }

  protected isEditing(kind: Editing['kind'], id: string | null): boolean {
    const editing = this.editing();
    if (!editing || editing.kind !== kind) return false;
    return editing.kind === 'new' ? editing.phaseId === id : editing.id === id;
  }

  protected renamePhase(event: Event, phase: AdminPhase, input: HTMLInputElement): void {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      toast.error('Escribe el nombre de la fase');
      input.focus();
      return;
    }
    if (name === phase.name) {
      this.editing.set(null);
      return;
    }
    void this.save(this.admin.renamePhase(phase.id, name), 'Fase renombrada');
  }

  protected createAction(body: ActionInput): void {
    void this.save(this.admin.createAction(body), `"${body.name}" agregada`);
  }

  protected updateAction(action: AdminAction, body: ActionInput): void {
    void this.save(this.admin.updateAction(action.id, body), 'Acción actualizada');
  }

  protected setActive(action: AdminAction, active: boolean): void {
    void this.save(
      this.admin.updateAction(action.id, { active }),
      active ? `"${action.name}" reactivada` : `"${action.name}" desactivada`,
    );
  }

  protected async move(action: AdminAction, direction: 'up' | 'down'): Promise<void> {
    try {
      this.applyChange(await firstValueFrom(this.admin.moveAction(action.id, direction)));
    } catch (error) {
      this.handleError(error);
    }
  }

  private async save(request: Observable<AdminTemplate>, success: string): Promise<void> {
    this.saving.set(true);
    try {
      this.applyChange(await firstValueFrom(request));
      this.editing.set(null);
      toast.success(success);
    } catch (error) {
      this.handleError(error);
    } finally {
      this.saving.set(false);
    }
  }

  private applyChange(template: AdminTemplate): void {
    this.template.set(template);
    this.lotsService.clearTemplate();
  }

  private handleError(error: unknown): void {
    if (error instanceof HttpErrorResponse && [400, 404, 409].includes(error.status)) {
      const message = error.error?.message;
      toast.error(Array.isArray(message) ? message.join('. ') : (message ?? 'Revisa los datos'));
    } else if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
      toast.error('No se pudo guardar. Inténtalo de nuevo.');
    }
  }
}
