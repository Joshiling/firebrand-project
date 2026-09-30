import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SearchLogPage } from './search-log.model';

@Injectable({ providedIn: 'root' })
export class SearchLogService {
  private readonly http = inject(HttpClient);

  getPage(page: number, pageSize: number, query = ''): Observable<SearchLogPage> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (query) {
      params = params.set('query', query);
    }

    return this.http.get<SearchLogPage>('/search_logs', { params });
  }
}
