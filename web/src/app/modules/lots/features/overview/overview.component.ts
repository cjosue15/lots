import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { relativeDay } from '../../../../shared/peru-date';
import { PhaseBarComponent } from '../../components/phase-bar.component';
import type { LotSummary } from '../../models/lot.model';
import { LotsService } from '../../services/lots.service';

interface GreenhouseGroup {
  name: string;
  lots: LotSummary[];
}

@Component({
  selector: 'app-overview',
  imports: [RouterLink, NgIcon, HlmButtonImports, HlmSkeletonImports, PhaseBarComponent],
  providers: [provideIcons({ lucideChevronRight })],
  templateUrl: './overview.component.html',
})
export class OverviewComponent {
  private readonly lotsService = inject(LotsService);

  protected readonly lots = rxResource({ stream: () => this.lotsService.getLots() });

  /** Lots grouped by greenhouse, keeping the API order. */
  protected readonly groups = computed<GreenhouseGroup[]>(() => {
    const groups = new Map<string, GreenhouseGroup>();
    for (const lot of this.lots.value() ?? []) {
      const group = groups.get(lot.greenhouse.id) ?? { name: lot.greenhouse.name, lots: [] };
      group.lots.push(lot);
      groups.set(lot.greenhouse.id, group);
    }
    return [...groups.values()];
  });

  protected readonly relativeDay = relativeDay;
}
