import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight } from '@ng-icons/lucide';
import { relativeDay } from '../../../shared/peru-date';
import { describeLogDetails } from '../models/details';
import type { ActionLog } from '../models/lot.model';

interface DayGroup {
  date: string;
  logs: ActionLog[];
}

/** Logs grouped by day (newest first, as the API sends them); each opens its detail. */
@Component({
  selector: 'app-log-list',
  imports: [RouterLink, NgIcon],
  providers: [provideIcons({ lucideChevronRight })],
  host: { class: 'block' },
  template: `
    @for (day of days(); track day.date) {
      <h3 class="mt-5 px-1 text-sm font-medium text-muted-foreground">{{ relativeDay(day.date) }}</h3>
      <ul class="mt-2 divide-y overflow-hidden rounded-lg border bg-card">
        @for (log of day.logs; track log.id) {
          <li>
            <a
              [routerLink]="['/logs', log.id]"
              class="flex items-center gap-3 px-4 py-3 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <span class="min-w-0 flex-1">
                <span class="flex items-baseline justify-between gap-3">
                  <span class="font-medium">{{ log.name }}</span>
                  <span class="shrink-0 text-xs text-muted-foreground">
                    {{ log.phase ? 'Fase ' + log.phase.order : 'General' }}
                  </span>
                </span>
                @for (line of describeLogDetails(log); track line) {
                  <span class="block text-sm">{{ line }}</span>
                }
                @if (log.notes) {
                  <span class="mt-1 line-clamp-2 block text-sm whitespace-pre-line text-muted-foreground">{{ log.notes }}</span>
                }
                <span class="mt-1.5 block text-xs text-muted-foreground">
                  {{ log.user.displayName }}@if (log.edited) {, editado}
                </span>
              </span>
              <ng-icon name="lucideChevronRight" size="16" class="shrink-0 text-muted-foreground" aria-hidden="true" />
            </a>
          </li>
        }
      </ul>
    } @empty {
      <div class="mt-3 rounded-lg border border-dashed p-6 text-center">
        <p class="font-medium">{{ emptyTitle() }}</p>
        @if (emptyHint()) {
          <p class="mt-1 text-sm text-muted-foreground">{{ emptyHint() }}</p>
        }
      </div>
    }
  `,
})
export class LogListComponent {
  readonly logs = input.required<ActionLog[]>();
  readonly emptyTitle = input('No hay registros.');
  readonly emptyHint = input('');

  protected readonly days = computed<DayGroup[]>(() => {
    const groups: DayGroup[] = [];
    for (const log of this.logs()) {
      const last = groups.at(-1);
      if (last?.date === log.date) {
        last.logs.push(log);
      } else {
        groups.push({ date: log.date, logs: [log] });
      }
    }
    return groups;
  });

  protected readonly relativeDay = relativeDay;
  protected readonly describeLogDetails = describeLogDetails;
}
