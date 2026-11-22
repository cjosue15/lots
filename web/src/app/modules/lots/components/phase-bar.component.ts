import { Component, computed, input } from '@angular/core';

const TOTAL_PHASES = 8;

/** Eight segments, one per phase of the template, filled up to the current one. */
@Component({
  selector: 'app-phase-bar',
  host: {
    role: 'img',
    '[attr.aria-label]': 'label()',
    class: 'flex gap-0.5',
  },
  template: `
    @for (segment of segments; track segment) {
      <span
        class="h-1.5 flex-1 rounded-full"
        [class]="segment <= (order() ?? 0) ? 'bg-primary' : 'bg-border'"
      ></span>
    }
  `,
})
export class PhaseBarComponent {
  /** Current phase order (1–8), or null without phase logs. */
  readonly order = input<number | null>(null);

  protected readonly segments = Array.from({ length: TOTAL_PHASES }, (_, i) => i + 1);
  protected readonly label = computed(() =>
    this.order() ? `Fase ${this.order()} de ${TOTAL_PHASES}` : 'Sin fase registrada',
  );
}
