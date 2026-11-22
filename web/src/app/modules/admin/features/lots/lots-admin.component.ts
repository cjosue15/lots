import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { firstValueFrom, type Observable } from 'rxjs';
import type { AdminGreenhouse, AdminLot } from '../../models/admin.model';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-lots-admin',
  host: { class: 'block max-w-3xl' },
  imports: [
    HlmAlertDialogImports,
    HlmButtonImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSkeletonImports,
  ],
  templateUrl: './lots-admin.component.html',
})
export class LotsAdminComponent {
  private readonly admin = inject(AdminService);

  protected readonly greenhouses = rxResource({ stream: () => this.admin.getLots() });
  /** Id of the lot or greenhouse being saved, to disable its controls. */
  protected readonly busy = signal<string | null>(null);

  protected activeCount(greenhouse: AdminGreenhouse): number {
    return greenhouse.lots.filter((lot) => lot.active).length;
  }

  protected nextNumber(greenhouse: AdminGreenhouse): number {
    return Math.max(0, ...greenhouse.lots.map((lot) => lot.number)) + 1;
  }

  protected addLot(event: Event, greenhouse: AdminGreenhouse, input: HTMLInputElement): void {
    event.preventDefault();
    const number = input.valueAsNumber;
    if (!Number.isInteger(number) || number < 1) {
      toast.error('Escribe un número de lote mayor que 0');
      input.focus();
      return;
    }
    void this.save(
      greenhouse.id,
      this.admin.createLot(greenhouse.id, number),
      `Lote ${number} agregado a ${greenhouse.name}`,
    );
  }

  protected setActive(lot: AdminLot, active: boolean): void {
    void this.save(
      lot.id,
      this.admin.updateLot(lot.id, active),
      active ? `Lote ${lot.number} reactivado` : `Lote ${lot.number} desactivado`,
    );
  }

  private async save(
    id: string,
    request: Observable<AdminGreenhouse[]>,
    success: string,
  ): Promise<void> {
    this.busy.set(id);
    try {
      this.greenhouses.set(await firstValueFrom(request));
      toast.success(success);
    } catch (error) {
      if (error instanceof HttpErrorResponse && [400, 404, 409].includes(error.status)) {
        const message = error.error?.message;
        toast.error(Array.isArray(message) ? message.join('. ') : (message ?? 'Revisa los datos'));
      } else if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        toast.error('No se pudo guardar. Inténtalo de nuevo.');
      }
    } finally {
      this.busy.set(null);
    }
  }
}
