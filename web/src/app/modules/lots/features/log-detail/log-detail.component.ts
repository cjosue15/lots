import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucideBan, lucideChevronLeft, lucidePencil } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { firstValueFrom } from 'rxjs';
import { formatDateTime, formatDay } from '../../../../shared/peru-date';
import { describeChange } from '../../models/changes';
import { describeLogDetails } from '../../models/details';
import { LotsService } from '../../services/lots.service';

@Component({
  selector: 'app-log-detail',
  imports: [
    RouterLink,
    NgIcon,
    HlmAlertDialogImports,
    HlmButtonImports,
    HlmCardImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTextareaImports,
  ],
  providers: [provideIcons({ lucideArrowRight, lucideBan, lucideChevronLeft, lucidePencil })],
  templateUrl: './log-detail.component.html',
})
export class LogDetailComponent {
  private readonly lotsService = inject(LotsService);

  /** Route param (withComponentInputBinding). */
  readonly logId = input.required<string>();

  protected readonly log = rxResource({
    params: () => this.logId(),
    stream: ({ params: id }) => this.lotsService.getLog(id),
  });

  /** Back to the closed cycle's page, or to the lot while the cycle is active. */
  protected readonly back = computed(() => {
    const log = this.log.value();
    if (!log) return null;
    return log.cycle.status === 'CLOSED'
      ? { link: ['/cycles', log.cycle.id], label: `Ciclo ${log.cycle.number}` }
      : { link: ['/lots', log.lot.id], label: `Lote ${log.lot.number}` };
  });

  protected readonly changes = computed(() =>
    (this.log.value()?.changes ?? []).map((change) => ({
      ...change,
      lines: describeChange(change.fields),
    })),
  );

  protected readonly voidReason = signal('');
  protected readonly voiding = signal(false);

  protected setVoidReason(event: Event): void {
    this.voidReason.set((event.target as HTMLTextAreaElement).value);
  }

  /** Voids the log with its reason (PLAN §9) and shows it crossed out. */
  protected async voidLog(close: () => void): Promise<void> {
    const reason = this.voidReason().trim();
    if (!reason || this.voiding()) return;
    this.voiding.set(true);
    try {
      await firstValueFrom(this.lotsService.voidLog(this.logId(), reason));
      close();
      this.voidReason.set('');
      this.log.reload();
      toast.success('Registro anulado');
    } catch (error) {
      if (error instanceof HttpErrorResponse && (error.status === 409 || error.status === 403)) {
        close();
        toast.error(error.error?.message ?? 'No se pudo anular el registro');
        this.log.reload();
      } else if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        toast.error('No se pudo anular el registro. Inténtalo de nuevo.');
      }
    } finally {
      this.voiding.set(false);
    }
  }

  protected readonly formatDay = formatDay;
  protected readonly formatDateTime = formatDateTime;
  protected readonly describeLogDetails = describeLogDetails;
}
