import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { ActionTemplate, CreateActionLog } from '../models/action.model';
import type { ActionLog, LotDetail, LotSummary } from '../models/lot.model';

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

  getTemplate(): Observable<ActionTemplate> {
    if (this.template) {
      return of(this.template);
    }
    return this.http
      .get<ActionTemplate>(`${this.api}/actions`)
      .pipe(tap((template) => (this.template = template)));
  }

  createLog(cycleId: string, body: CreateActionLog): Observable<ActionLog> {
    return this.http.post<ActionLog>(`${this.api}/cycles/${cycleId}/logs`, body);
  }
}
