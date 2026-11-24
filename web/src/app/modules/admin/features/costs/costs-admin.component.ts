import { Component, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { formatDay, todayInPeru } from '../../../../shared/peru-date';
import { DateFieldComponent } from '../../../../shared/ui/date-field.component';
import { formatAmount } from '../../../lots/models/details';
import { formatMoney } from '../../models/product-admin.model';
import { AdminService } from '../../services/admin.service';

/** What applications cost per cycle and per product, in a date range (PLAN §14). */
@Component({
  selector: 'app-costs-admin',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButtonImports,
    HlmFieldImports,
    HlmSkeletonImports,
    HlmTableImports,
    DateFieldComponent,
  ],
  templateUrl: './costs-admin.component.html',
})
export class CostsAdminComponent {
  private readonly admin = inject(AdminService);

  protected readonly today = todayInPeru();
  /** Empty = no limit on that side. */
  protected readonly range = inject(FormBuilder).nonNullable.group({ from: [''], to: [''] });
  private readonly rangeValue = toSignal(this.range.valueChanges, {
    initialValue: this.range.getRawValue(),
  });

  protected readonly report = rxResource({
    params: () => ({ from: this.rangeValue().from ?? '', to: this.rangeValue().to ?? '' }),
    stream: ({ params }) => this.admin.getCosts(params.from || undefined, params.to || undefined),
  });

  protected readonly money = formatMoney;
  protected readonly day = formatDay;
  protected readonly amount = formatAmount;

  /** "Desde el 1 nov 2026", "Hasta…", "Del… al…" or "Desde el inicio". */
  protected rangeLabel(): string {
    const { from, to } = this.rangeValue();
    if (from && to) return `Del ${formatDay(from)} al ${formatDay(to)}`;
    if (from) return `Desde el ${formatDay(from)}`;
    if (to) return `Hasta el ${formatDay(to)}`;
    return 'Todas las aplicaciones registradas';
  }

  protected clear(): void {
    this.range.setValue({ from: '', to: '' });
  }
}
