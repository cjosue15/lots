import {
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBox, lucideList, lucideX } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { relativeDay, todayInPeru } from '../../../../shared/peru-date';
import type { LotSummary } from '../../../lots/models/lot.model';
import { LotsService } from '../../../lots/services/lots.service';
import { type Activity, activityOf, daysWithoutLogs, STALE_AFTER_DAYS } from './activity';
import { computeLayout } from './layout';
import type { FarmScene } from './scene/farm-scene';

interface Card {
  lot: LotSummary;
  x: number;
  y: number;
  /** Open to the left / above the pointer when near the right / bottom edge. */
  flipX: boolean;
  flipY: boolean;
  /** Opened by click/tap (stays open, shows the link) vs. hover. */
  pinned: boolean;
}

const ALL = 'all';

const ACTIVITY_LABELS: Record<Activity, string> = {
  today: 'Con registros hoy',
  recent: 'Con registros recientes',
  stale: `${STALE_AFTER_DAYS} días o más sin registros`,
  idle: 'Sin ciclo activo',
};

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Admin "Vista 3D" (PLAN §10): every lot as a bed dressed for its phase. */
@Component({
  selector: 'app-farm-map',
  imports: [RouterLink, NgIcon, HlmButtonImports, HlmSkeletonImports],
  providers: [provideIcons({ lucideBox, lucideList, lucideX })],
  templateUrl: './farm-map.component.html',
  styleUrl: './farm-map.component.css',
  // The lot labels are created by three.js outside the template.
  encapsulation: ViewEncapsulation.None,
})
export class FarmMapComponent {
  private readonly lotsService = inject(LotsService);

  protected readonly lots = rxResource({ stream: () => this.lotsService.getLots() });
  protected readonly supportsWebgl = webglAvailable();
  protected readonly view = signal<'3d' | 'list'>(this.supportsWebgl ? '3d' : 'list');
  /** Greenhouse shown in 3D, ALL for every one, null before choosing (nothing loaded). */
  protected readonly selected = signal<string | null>(null);
  protected readonly all = ALL;
  protected readonly staleDays = STALE_AFTER_DAYS;
  protected readonly card = signal<Card | null>(null);
  protected readonly activityLabels = ACTIVITY_LABELS;
  protected readonly relativeDay = relativeDay;

  private readonly canvasHost = viewChild<ElementRef<HTMLElement>>('canvasHost');
  private scene: FarmScene | null = null;
  private sceneHost: HTMLElement | null = null;

  protected readonly layout = computed(() => computeLayout(this.lots.value() ?? []));
  /** Only the chosen greenhouse is built, to keep the scene light. */
  private readonly sceneLayout = computed(() => {
    const selected = this.selected();
    const lots = this.lots.value() ?? [];
    return computeLayout(
      selected === ALL ? lots : lots.filter((lot) => lot.greenhouse.id === selected),
    );
  });
  /** Per greenhouse: lots with logs today and lots without logs for days. */
  protected readonly counts = computed(() => {
    const counts = new Map<string, { today: number; stale: number }>();
    for (const lot of this.lots.value() ?? []) {
      const count = counts.get(lot.greenhouse.id) ?? { today: 0, stale: 0 };
      const activity = this.activityOf(lot.id);
      if (activity === 'today') count.today++;
      if (activity === 'stale') count.stale++;
      counts.set(lot.greenhouse.id, count);
    }
    return counts;
  });
  protected readonly activity = computed(() => {
    const today = todayInPeru();
    return new Map((this.lots.value() ?? []).map((lot) => [lot.id, activityOf(lot, today)]));
  });
  private readonly lotsById = computed(
    () => new Map((this.lots.value() ?? []).map((lot) => [lot.id, lot])),
  );

  constructor() {
    // (Re)creates the scene when its host appears (3D view) and feeds it data.
    effect(() => {
      const host = this.canvasHost()?.nativeElement ?? null;
      const layout = this.sceneLayout();
      const activity = this.activity();
      if (host !== this.sceneHost) {
        this.disposeScene();
        if (host) void this.createScene(host);
        return;
      }
      if (this.scene && this.lots.hasValue()) this.scene.setLayout(layout, activity);
    });
    inject(DestroyRef).onDestroy(() => this.disposeScene());
  }

  protected select(greenhouseId: string): void {
    this.closeCard();
    this.selected.set(greenhouseId);
  }

  protected closeCard(): void {
    this.card.set(null);
    this.scene?.setSelected(null);
  }

  protected activityOf(lotId: string): Activity {
    return this.activity().get(lotId) ?? 'idle';
  }

  /** Activity text for one lot; stale lots say exactly how long. */
  protected activityText(lot: LotSummary): string {
    const activity = this.activityOf(lot.id);
    return activity === 'stale'
      ? `${daysWithoutLogs(lot)} días sin registros`
      : ACTIVITY_LABELS[activity];
  }

  private async createScene(host: HTMLElement): Promise<void> {
    this.sceneHost = host;
    const { FarmScene } = await import('./scene/farm-scene');
    if (this.sceneHost !== host) return;
    this.scene = new FarmScene(host, {
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      onHover: (lotId, x, y) => {
        if (this.card()?.pinned) return;
        const lot = lotId ? this.lotsById().get(lotId) : undefined;
        this.card.set(lot ? { lot, ...this.place(host, x, y), pinned: false } : null);
      },
      onSelect: (lotId, x, y) => {
        const lot = lotId ? this.lotsById().get(lotId) : undefined;
        this.card.set(lot ? { lot, ...this.place(host, x, y), pinned: true } : null);
        this.scene?.setSelected(lot ? lot.id : null);
      },
    });
    if (this.lots.hasValue()) this.scene.setLayout(this.sceneLayout(), this.activity());
  }

  private place(host: HTMLElement, x: number, y: number) {
    return { x, y, flipX: x > host.clientWidth - 300, flipY: y > host.clientHeight * 0.55 };
  }

  private disposeScene(): void {
    this.scene?.dispose();
    this.scene = null;
    this.sceneHost = null;
    this.card.set(null);
  }
}
