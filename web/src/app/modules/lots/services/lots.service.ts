import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { ActionTemplate, CreateActionLog, UpdateActionLog } from '../models/action.model';
import type {
  ActionLog,
  ActionLogDetail,
  CycleDetail,
  LotDetail,
  LotSummary,
} from '../models/lot.model';
import type { CatalogProduct } from '../models/product.model';

@Service()
export class LotsService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  /** The template rarely changes: kept after the first successful load. */
  private template: ActionTemplate | null = null;

  getLots(): Observable<LotSummary[]> {
    return this.http.get<LotSummary[]>(`${this.api}/lots`);
  }

  getLot(id: string): Observable<LotDetail> {
    return this.http.get<LotDetail>(`${this.api}/lots/${id}`);
  }

  startCycle(lotId: string, startDate?: string): Observable<LotDetail> {
    return this.http.post<LotDetail>(`${this.api}/lots/${lotId}/cycles`, { startDate });
  }

  /** Called after the admin edits the template, so the form loads the new one. */
  clearTemplate(): void {
    this.template = null;
  }

  getTemplate(): Observable<ActionTemplate> {
    if (this.template) {
      return of(this.template);
    }
    return this.http
      .get<ActionTemplate>(`${this.api}/actions`)
      .pipe(tap((template) => (this.template = template)));
  }

  /**
   * Active products with their stock in the lot's greenhouse, fresh each time
   * (stock changes with every log).
   */
  getProducts(lotId: string): Observable<CatalogProduct[]> {
    return this.http.get<CatalogProduct[]>(`${this.api}/products`, { params: { lotId } });
  }

  createLog(cycleId: string, body: CreateActionLog): Observable<ActionLog> {
    return this.http.post<ActionLog>(`${this.api}/cycles/${cycleId}/logs`, body);
  }

  getLog(id: string): Observable<ActionLogDetail> {
    return this.http.get<ActionLogDetail>(`${this.api}/logs/${id}`);
  }

  updateLog(id: string, body: UpdateActionLog): Observable<ActionLog> {
    return this.http.patch<ActionLog>(`${this.api}/logs/${id}`, body);
  }

  getCycle(id: string): Observable<CycleDetail> {
    return this.http.get<CycleDetail>(`${this.api}/cycles/${id}`);
  }
}
