import { Component, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { formatDay } from '../../../../shared/peru-date';
import { LogListComponent } from '../../components/log-list.component';
import { PhaseBarComponent } from '../../components/phase-bar.component';
import { AuthService } from '../../../auth/services/auth.service';
import { CycleCostComponent } from '../../../admin/features/costs/cycle-cost.component';
import { LotsService } from '../../services/lots.service';

/** A cycle of the lot's history (usually closed) with all its logs. */
@Component({
  selector: 'app-cycle-detail',
  imports: [RouterLink, NgIcon, HlmButtonImports, HlmSkeletonImports, LogListComponent, PhaseBarComponent, CycleCostComponent],
  providers: [provideIcons({ lucideChevronLeft })],
  template: `
    <div class="mx-auto w-full max-w-3xl">
      @if (cycle.isLoading() && !cycle.hasValue()) {
        <div class="flex flex-col gap-3" aria-busy="true" aria-label="Cargando ciclo">
          <hlm-skeleton class="h-6 w-24" />
          <hlm-skeleton class="h-8 w-48" />
          <hlm-skeleton class="h-24 w-full rounded-lg" />
        </div>
      } @else if (cycle.error()) {
        <div class="rounded-lg border bg-card p-4">
          <p class="font-medium">No se pudo cargar el ciclo.</p>
          <p class="mt-1 text-sm text-muted-foreground">Revisa tu conexión y vuelve a intentarlo.</p>
          <button hlmBtn variant="outline" class="mt-4" (click)="cycle.reload()">Reintentar</button>
        </div>
      } @else if (cycle.value(); as cycle) {
        <a
          [routerLink]="['/lots', cycle.lot.id]"
          class="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-1 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ng-icon name="lucideChevronLeft" size="16" aria-hidden="true" />
          Lote {{ cycle.lot.number }}
        </a>

        <p class="mt-3 text-sm text-muted-foreground">
          {{ cycle.lot.greenhouse.name }}, lote {{ cycle.lot.number }}
        </p>
        <h1 class="text-2xl font-semibold">
          Ciclo {{ cycle.number }}
          @if (cycle.status === 'ACTIVE') {
            <span class="ml-1 align-middle text-sm font-normal text-muted-foreground">(activo)</span>
          }
        </h1>

        <section class="mt-4 rounded-lg border bg-card p-4" aria-label="Resumen del ciclo">
          <p class="text-sm text-muted-foreground tabular-nums">
            @if (cycle.endDate) {
              Del {{ formatDay(cycle.startDate) }} al {{ formatDay(cycle.endDate) }}, {{ cycle.days }} días
            } @else {
              Desde {{ formatDay(cycle.startDate) }}, día {{ cycle.days }}
            }
          </p>
          <p class="mt-3 text-lg font-medium">
            @if (cycle.phase; as phase) {
              {{ cycle.endDate ? 'Llegó a' : '' }} {{ phase.name }}
              <span class="text-sm font-normal text-muted-foreground">fase {{ phase.order }} de 8</span>
            } @else {
              Sin registros de fase
            }
          </p>
          <app-phase-bar class="mt-2" [order]="cycle.phase?.order ?? null" />
        </section>

        @if (isAdmin()) {
          <app-cycle-cost class="mt-4 block" [cycleId]="cycle.id" />
        }

        <section class="mt-8" aria-labelledby="cycle-logs-title">
          <h2 id="cycle-logs-title" class="px-1 text-lg font-semibold">
            Registros
            <span class="text-sm font-normal text-muted-foreground">({{ cycle.logs.length }})</span>
          </h2>
          <app-log-list [logs]="cycle.logs" emptyTitle="Este ciclo no tuvo registros." />
        </section>
      }
    </div>
  `,
})
export class CycleDetailComponent {
  private readonly lotsService = inject(LotsService);
  protected readonly isAdmin = inject(AuthService).isAdmin;

  /** Route param (withComponentInputBinding). */
  readonly cycleId = input.required<string>();

  protected readonly cycle = rxResource({
    params: () => this.cycleId(),
    stream: ({ params: id }) => this.lotsService.getCycle(id),
  });

  protected readonly formatDay = formatDay;
}
