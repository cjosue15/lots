import { Component, computed, input } from '@angular/core';

const GREENHOUSES = [
  { name: 'El Dorado', lots: 3 },
  { name: 'Bungalows', lots: 12 },
  { name: 'Carmen Alto', lots: 9 },
] as const;

/** The 24 lots drawn as beds, grouped by greenhouse. Shown on the green brand panel. */
@Component({
  selector: 'app-lot-map',
  host: {
    role: 'img',
    '[attr.aria-label]': 'label',
    class: 'block',
  },
  template: `
    <div class="flex flex-col" [class]="large() ? 'gap-6' : 'gap-3'">
      @for (greenhouse of greenhouses; track greenhouse.name) {
        <div class="flex flex-col" [class]="large() ? 'gap-2' : 'gap-1.5'">
          <p class="text-primary-foreground/80" [class]="large() ? 'text-base' : 'text-xs'">
            {{ greenhouse.name }}
          </p>
          <div class="flex flex-wrap" [class]="large() ? 'gap-1.5' : 'gap-1'">
            @for (n of greenhouse.numbers; track n) {
              <span
                class="flex items-center justify-center rounded-[3px] border border-white/25 bg-white/10 text-primary-foreground/90 tabular-nums"
                [class]="cellClass()"
              >
                {{ n }}
              </span>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class LotMapComponent {
  readonly large = input(false);

  protected readonly greenhouses = GREENHOUSES.map((g) => ({
    name: g.name,
    numbers: Array.from({ length: g.lots }, (_, i) => i + 1),
  }));

  protected readonly label = `Plano de lotes: ${GREENHOUSES.map(
    (g) => `${g.name}, ${g.lots} lotes`,
  ).join('; ')}`;

  protected readonly cellClass = computed(() =>
    this.large() ? 'h-10 w-14 text-sm' : 'h-6 w-8 text-[11px]',
  );
}
