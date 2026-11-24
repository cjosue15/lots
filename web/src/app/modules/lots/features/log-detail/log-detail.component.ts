import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucideChevronLeft, lucidePencil } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { formatDateTime, formatDay } from '../../../../shared/peru-date';
import { describeChange } from '../../models/changes';
import { describeLogDetails } from '../../models/details';
import { LotsService } from '../../services/lots.service';

@Component({
  selector: 'app-log-detail',
  imports: [RouterLink, NgIcon, HlmButtonImports, HlmCardImports, HlmSkeletonImports],
  providers: [provideIcons({ lucideArrowRight, lucideChevronLeft, lucidePencil })],
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

  protected readonly formatDay = formatDay;
  protected readonly formatDateTime = formatDateTime;
  protected readonly describeLogDetails = describeLogDetails;
}
