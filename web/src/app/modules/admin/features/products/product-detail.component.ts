import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideMinus, lucidePlus } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { firstValueFrom } from 'rxjs';
import { formatDay } from '../../../../shared/peru-date';
import { DOSE_SYMBOLS, formatAmount } from '../../../lots/models/details';
import {
  ALERT_LABELS,
  formatMoney,
  MOVEMENT_LABELS,
  type ProductDetail,
  type ProductMovement,
  stockAlert,
  usesProduct,
} from '../../models/product-admin.model';
import { AuthService } from '../../../auth/services/auth.service';
import { AdminService } from '../../services/admin.service';
import { ProductFormComponent } from './product-form.component';
import { showSaveError } from './show-save-error';
import { StockAdjustFormComponent, StockEntryFormComponent } from './stock-forms.component';

/** One product: stock per greenhouse, entries and adjustments, and its ledger (kárdex). */
@Component({
  selector: 'app-product-detail',
  imports: [
    RouterLink,
    NgIcon,
    HlmAlertDialogImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmDialogImports,
    HlmSkeletonImports,
    HlmTableImports,
    ProductFormComponent,
    StockAdjustFormComponent,
    StockEntryFormComponent,
  ],
  providers: [provideIcons({ lucideChevronLeft, lucideMinus, lucidePlus })],
  templateUrl: './product-detail.component.html',
})
export class ProductDetailComponent {
  private readonly admin = inject(AdminService);
  /** Engineers see stock, never prices (PLAN §14). */
  protected readonly isAdmin = inject(AuthService).isAdmin;

  /** Route param. */
  readonly id = input.required<string>();

  protected readonly product = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.admin.getProduct(params),
  });
  /** Categories for the edit form; loaded once. */
  protected readonly catalog = rxResource({ stream: () => this.admin.getProducts() });
  protected readonly categories = computed(() => this.catalog.value()?.categories ?? []);
  protected readonly greenhouses = computed(
    () => this.product.value()?.greenhouses.map((s) => s.greenhouse) ?? [],
  );

  /** Greenhouse id the ledger shows, or '' for all; also preselected in the stock forms. */
  protected readonly greenhouse = signal('');
  protected readonly movements = computed(() =>
    (this.product.value()?.movements ?? []).filter(
      (m) => !this.greenhouse() || m.greenhouse.id === this.greenhouse(),
    ),
  );

  protected readonly totals = computed(() => {
    const product = this.product.value();
    if (!product) return { stock: 0, value: null };
    const stock = product.greenhouses.reduce((sum, s) => sum + s.stock, 0);
    const positive = product.greenhouses.reduce((sum, s) => sum + Math.max(s.stock, 0), 0);
    return {
      stock,
      value: product.averageCost !== null && positive > 0 ? positive * product.averageCost : null,
    };
  });

  protected readonly busy = signal(false);
  protected readonly labels = MOVEMENT_LABELS;
  protected readonly alertLabels = ALERT_LABELS;
  protected readonly stockAlert = stockAlert;
  protected readonly usesProduct = usesProduct;
  protected readonly money = formatMoney;
  protected readonly date = formatDay;

  protected amount(product: ProductDetail, value: number): string {
    return formatAmount(value, product.unit);
  }

  protected symbol(product: ProductDetail): string {
    return DOSE_SYMBOLS[product.unit];
  }

  /** "+2 L" / "−250 ml" style, in the product's unit. */
  protected signed(product: ProductDetail, movement: ProductMovement): string {
    const amount = formatAmount(Math.abs(movement.quantity), product.unit);
    if (movement.quantity === 0) return amount;
    return movement.quantity > 0 ? `+${amount}` : `−${amount}`;
  }

  protected updated(detail: ProductDetail, close?: () => void): void {
    this.product.set(detail);
    close?.();
  }

  protected async setActive(product: ProductDetail, active: boolean): Promise<void> {
    this.busy.set(true);
    try {
      this.product.set(await firstValueFrom(this.admin.updateProduct(product.id, { active })));
      toast.success(`${product.name} ${active ? 'reactivado' : 'desactivado'}`);
    } catch (error) {
      showSaveError(error);
    } finally {
      this.busy.set(false);
    }
  }
}
