import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronRight,
  lucidePlus,
  lucideSearch,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmInputGroupImports } from '@spartan-ng/helm/input-group';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { firstValueFrom } from 'rxjs';
import { DOSE_SYMBOLS, formatAmount } from '../../../lots/models/details';
import {
  type AdminCategory,
  type AdminProduct,
  formatMoney,
  type ProductDetail,
} from '../../models/product-admin.model';
import { AdminService } from '../../services/admin.service';
import { ProductFormComponent } from './product-form.component';
import { showSaveError } from './show-save-error';

/** Catalog with stock and alerts, plus categories (PLAN §14). Desktop first. */
@Component({
  selector: 'app-products-admin',
  imports: [
    RouterLink,
    NgIcon,
    HlmBadgeImports,
    HlmButtonImports,
    HlmDialogImports,
    HlmInputImports,
    HlmInputGroupImports,
    HlmLabelImports,
    HlmSkeletonImports,
    HlmTableImports,
    ProductFormComponent,
  ],
  providers: [provideIcons({ lucideChevronRight, lucidePlus, lucideSearch, lucideTriangleAlert })],
  templateUrl: './products-admin.component.html',
})
export class ProductsAdminComponent {
  private readonly admin = inject(AdminService);
  private readonly router = inject(Router);

  protected readonly data = rxResource({ stream: () => this.admin.getProducts() });

  /** Category id, or '' for all. */
  protected readonly category = signal('');
  protected readonly search = signal('');
  protected readonly onlyAlerts = signal(false);
  protected readonly busy = signal<string | null>(null);

  protected readonly categories = computed(() => this.data.value()?.categories ?? []);

  protected readonly alerts = computed(() => {
    const active = (this.data.value()?.products ?? []).filter((p) => p.active);
    return {
      out: active.filter((p) => p.status === 'OUT').length,
      low: active.filter((p) => p.status === 'LOW').length,
    };
  });

  protected readonly products = computed(() => {
    const term = normalize(this.search().trim());
    return (this.data.value()?.products ?? [])
      .filter(
        (p) =>
          (!this.category() || p.category.id === this.category()) &&
          (!term || normalize(p.name).includes(term)) &&
          (!this.onlyAlerts() || (p.active && p.status !== 'OK')),
      )
      .sort((a, b) => Number(b.active) - Number(a.active));
  });

  protected readonly amount = (product: AdminProduct, value: number) =>
    formatAmount(value, product.unit);
  protected readonly symbol = (product: AdminProduct) => DOSE_SYMBOLS[product.unit];
  protected readonly money = formatMoney;

  protected created(detail: ProductDetail, close: () => void): void {
    close();
    void this.router.navigate(['/admin/products', detail.id]);
  }

  protected async addCategory(event: Event, input: HTMLInputElement): Promise<void> {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      toast.error('Escribe el nombre de la categoría');
      input.focus();
      return;
    }
    if (await this.saveCategories('new', () => this.admin.createCategory(name))) {
      toast.success(`Categoría ${name} agregada`);
      input.value = '';
    }
  }

  protected async setCategoryActive(category: AdminCategory, active: boolean): Promise<void> {
    const saved = await this.saveCategories(category.id, () =>
      this.admin.updateCategory(category.id, { active }),
    );
    if (saved) {
      toast.success(`Categoría ${category.name} ${active ? 'reactivada' : 'desactivada'}`);
      if (!active && this.category() === category.id) this.category.set('');
    }
  }

  private async saveCategories(
    id: string,
    request: () => ReturnType<AdminService['createCategory']>,
  ): Promise<boolean> {
    this.busy.set(id);
    try {
      this.data.set(await firstValueFrom(request()));
      return true;
    } catch (error) {
      showSaveError(error);
      return false;
    } finally {
      this.busy.set(null);
    }
  }
}

/** Lowercase without accents, so "quimico" finds "Químico". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
