import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronLeft,
  lucideChevronRight,
  lucidePlus,
  lucideRefreshCw,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { firstValueFrom } from 'rxjs';
import { formatDay, todayInPeru } from '../../../../shared/peru-date';
import { DateFieldComponent } from '../../../../shared/ui/date-field.component';
import { LogListComponent } from '../../components/log-list.component';
import { PhaseBarComponent, TOTAL_PHASES } from '../../components/phase-bar.component';
import { LotsService } from '../../services/lots.service';

@Component({
  selector: 'app-lot-detail',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    NgIcon,
    HlmAlertDialogImports,
    HlmButtonImports,
    HlmFieldImports,
    DateFieldComponent,
    HlmSkeletonImports,
    HlmSpinnerImports,
    LogListComponent,
    PhaseBarComponent,
  ],
  providers: [provideIcons({ lucideChevronLeft, lucideChevronRight, lucidePlus, lucideRefreshCw })],
  templateUrl: './lot-detail.component.html',
})
export class LotDetailComponent {
  private readonly lotsService = inject(LotsService);

  /** Route param (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly lot = rxResource({
    params: () => this.id(),
    stream: ({ params: id }) => this.lotsService.getLot(id),
  });
  protected readonly startingCycle = signal(false);

  protected readonly nextCycleNumber = computed(() => (this.lot.value()?.cycle?.number ?? 0) + 1);

  protected readonly closedCycles = computed(
    () => this.lot.value()?.cycles.filter((cycle) => cycle.status === 'CLOSED') ?? [],
  );

  protected readonly today = todayInPeru();
  /** "Fecha de inicio" of the new cycle: today by default, never in the future. */
  protected readonly startDate = new FormControl(this.today, {
    nonNullable: true,
    validators: Validators.required,
  });
  /**
   * The active cycle closes on that day, so it can't go before its start nor
   * before its last (non-voided) log.
   */
  protected readonly minStartDate = computed(() => {
    const lot = this.lot.value();
    if (!lot?.cycle) return undefined;
    return lot.logs
      .filter((log) => !log.voided)
      .reduce((min, log) => (log.date > min ? log.date : min), lot.cycle.startDate);
  });

  protected readonly formatDay = formatDay;
  protected readonly totalPhases = TOTAL_PHASES;

  /** Each time the dialog opens it starts again from today. */
  protected resetStartDate(): void {
    this.startDate.reset(this.today);
  }

  /** Closes the dialog and starts the cycle; the dialog stays open while the date is missing. */
  protected async startCycle(dialog: { close: () => void }): Promise<void> {
    // Typed by hand, the date can skip the picker's limits.
    const min = this.minStartDate();
    const value = this.startDate.value;
    if (value && min && value < min) this.startDate.setErrors({ min: true });
    if (value && value > this.today) this.startDate.setErrors({ max: true });
    if (this.startDate.invalid) {
      this.startDate.markAsTouched();
      return;
    }
    dialog.close();
    const number = this.nextCycleNumber();
    const startDate = this.startDate.value;
    this.startingCycle.set(true);
    try {
      const updated = await firstValueFrom(this.lotsService.startCycle(this.id(), startDate));
      this.lot.set(updated);
      toast.success(
        startDate === this.today
          ? `Ciclo ${number} iniciado`
          : `Ciclo ${number} iniciado el ${formatDay(startDate)}`,
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        toast.error(error.error?.message ?? 'Otra persona acaba de iniciar un ciclo en este lote');
        this.lot.reload();
      } else if (error instanceof HttpErrorResponse && error.status === 400) {
        const message = error.error?.message;
        toast.error(
          Array.isArray(message) ? message.join('. ') : (message ?? 'Revisa la fecha de inicio'),
        );
      } else if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        toast.error('No se pudo iniciar el ciclo. Inténtalo de nuevo.');
      }
    } finally {
      this.startingCycle.set(false);
    }
  }
}
