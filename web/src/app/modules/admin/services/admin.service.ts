import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { ActionInput, AdminGreenhouse, AdminTemplate } from '../models/admin.model';
import type {
  AdminProducts,
  CostReport,
  CycleCost,
  CreateProductInput,
  ProductDetail,
  UpdateProductInput,
} from '../models/product-admin.model';

/** Every mutation answers with the whole updated list. */
@Service()
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/admin`;

  getTemplate(): Observable<AdminTemplate> {
    return this.http.get<AdminTemplate>(`${this.api}/template`);
  }

  renamePhase(id: string, name: string): Observable<AdminTemplate> {
    return this.http.patch<AdminTemplate>(`${this.api}/phases/${id}`, { name });
  }

  createAction(body: ActionInput): Observable<AdminTemplate> {
    return this.http.post<AdminTemplate>(`${this.api}/actions`, body);
  }

  updateAction(
    id: string,
    body: Partial<ActionInput> & { active?: boolean },
  ): Observable<AdminTemplate> {
    return this.http.patch<AdminTemplate>(`${this.api}/actions/${id}`, body);
  }

  moveAction(id: string, direction: 'up' | 'down'): Observable<AdminTemplate> {
    return this.http.post<AdminTemplate>(`${this.api}/actions/${id}/move`, { direction });
  }

  getLots(): Observable<AdminGreenhouse[]> {
    return this.http.get<AdminGreenhouse[]>(`${this.api}/lots`);
  }

  createLot(greenhouseId: string, number: number): Observable<AdminGreenhouse[]> {
    return this.http.post<AdminGreenhouse[]>(`${this.api}/lots`, { greenhouseId, number });
  }

  updateLot(id: string, active: boolean): Observable<AdminGreenhouse[]> {
    return this.http.patch<AdminGreenhouse[]>(`${this.api}/lots/${id}`, { active });
  }

  getProducts(): Observable<AdminProducts> {
    return this.http.get<AdminProducts>(`${this.api}/products`);
  }

  getProduct(id: string): Observable<ProductDetail> {
    return this.http.get<ProductDetail>(`${this.api}/products/${id}`);
  }

  createProduct(body: CreateProductInput): Observable<ProductDetail> {
    return this.http.post<ProductDetail>(`${this.api}/products`, body);
  }

  updateProduct(id: string, body: UpdateProductInput): Observable<ProductDetail> {
    return this.http.patch<ProductDetail>(`${this.api}/products/${id}`, body);
  }

  addStock(
    id: string,
    body: { quantity: number; unitCost: number; date: string },
  ): Observable<ProductDetail> {
    return this.http.post<ProductDetail>(`${this.api}/products/${id}/entries`, body);
  }

  adjustStock(
    id: string,
    body: { counted: number; reason: string; date: string },
  ): Observable<ProductDetail> {
    return this.http.post<ProductDetail>(`${this.api}/products/${id}/adjustments`, body);
  }

  createCategory(name: string): Observable<AdminProducts> {
    return this.http.post<AdminProducts>(`${this.api}/product-categories`, { name });
  }

  updateCategory(id: string, body: { name?: string; active?: boolean }): Observable<AdminProducts> {
    return this.http.patch<AdminProducts>(`${this.api}/product-categories/${id}`, body);
  }

  /** Applications dated between `from` and `to` (inclusive; both optional). */
  getCosts(from?: string, to?: string): Observable<CostReport> {
    const params: Record<string, string> = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.http.get<CostReport>(`${this.api}/costs`, { params });
  }

  getCycleCosts(cycleId: string): Observable<CycleCost> {
    return this.http.get<CycleCost>(`${this.api}/cycles/${cycleId}/costs`);
  }
}
