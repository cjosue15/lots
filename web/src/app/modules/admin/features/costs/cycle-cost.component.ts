import { Component, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { formatAmount } from '../../../lots/models/details';
import { formatMoney } from '../../models/product-admin.model';
import { AdminService } from '../../services/admin.service';

/** What a cycle's applications cost, by product. Admin only. */
@Component({
  selector: 'app-cycle-cost',
  imports: [RouterLink, HlmButtonImports, HlmSkeletonImports],
  template: `
    <section class="rounded-lg border bg-card p-4" aria-labelledby="cycle-cost-title">
      <div class="flex items-baseline justify-between gap-3">
        <h2 id="cycle-cost-title" class="font-medium">Costo en productos</h2>
        <span class="text-xs text-muted-foreground">Solo lo ve el administrador</span>
      </div>
      @if (cost.isLoading() && !cost.hasValue()) {
        <hlm-skeleton class="mt-3 h-8 w-32" />
      } @else if (cost.error()) {
        <p class="mt-2 text-sm text-muted-foreground">
          No se pudo calcular el costo.
          <button hlmBtn variant="link" size="sm" class="h-auto p-0" (click)="cost.reload()">
            Reintentar
          </button>
        </p>
      } @else if (cost.value(); as c) {
        <p class="mt-1 text-2xl font-semibold tabular-nums">{{ money(c.total) }}</p>
        @if (c.products.length) {
          <ul class="mt-3 divide-y text-sm">
            @for (p of c.products; track p.productId) {
              <li class="flex items-baseline gap-3 py-2">
                <a
                  [routerLink]="['/admin/products', p.productId]"
                  class="min-w-0 flex-1 truncate rounded-sm underline-offset-2 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {{ p.name }}
                </a>
                <span class="text-muted-foreground tabular-nums">{{
                  amount(p.quantity, p.unit)
                }}</span>
                <span class="w-24 text-end font-medium tabular-nums">{{ money(p.cost) }}</span>
              </li>
            }
          </ul>
        } @else {
          <p class="mt-1 text-sm text-muted-foreground">
            Aún no hay aplicaciones con productos del catálogo y cantidad.
          </p>
        }
      }
    </section>
  `,
})
export class CycleCostComponent {
  private readonly admin = inject(AdminService);

  readonly cycleId = input.required<string>();

  protected readonly cost = rxResource({
    params: () => this.cycleId(),
    stream: ({ params }) => this.admin.getCycleCosts(params),
  });

  protected readonly money = formatMoney;
  protected readonly amount = formatAmount;
}
