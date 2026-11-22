import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { ActionInput, AdminGreenhouse, AdminTemplate } from '../models/admin.model';

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
}
