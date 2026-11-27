import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideChevronRight, lucidePlus, lucideRefreshCw } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { firstValueFrom } from 'rxjs';
import { formatDay } from '../../../../shared/peru-date';
import { LogListComponent } from '../../components/log-list.component';
import { PhaseBarComponent, TOTAL_PHASES } from '../../components/phase-bar.component';
import { LotsService } from '../../services/lots.service';

@Component({
  selector: 'app-lot-detail',
  imports: [
    RouterLink,
    NgIcon,
    HlmAlertDialogImports,
    HlmButtonImports,
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

  protected readonly formatDay = formatDay;
  protected readonly totalPhases = TOTAL_PHASES;

  protected async startCycle(): Promise<void> {
    const number = this.nextCycleNumber();
    this.startingCycle.set(true);
    try {
      const updated = await firstValueFrom(this.lotsService.startCycle(this.id()));
      this.lot.set(updated);
      toast.success(`Ciclo ${number} iniciado`);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        toast.error(error.error?.message ?? 'Otra persona acaba de iniciar un ciclo en este lote');
        this.lot.reload();
      } else if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        toast.error('No se pudo iniciar el ciclo. Inténtalo de nuevo.');
      }
    } finally {
      this.startingCycle.set(false);
    }
  }
}
