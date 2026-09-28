import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import { CompanySearchPage, CompanySearchRequest, CompanySummary } from './company.model';
import { CompanySearchService } from './company-search.service';
import { MOCK_COMPANIES } from './mock-companies';

@Injectable()
export class MockCompanySearchService extends CompanySearchService {
  override search(request: CompanySearchRequest): Observable<CompanySearchPage> {
    const query = request.query.trim().toLocaleLowerCase();
    const page = Math.max(1, request.page);
    const pageSize = Math.max(1, request.pageSize);
    const registrationMatch = MOCK_COMPANIES.find(
      (company) => company.registrationNumber.toLocaleLowerCase() === query,
    );
    const matches: readonly CompanySummary[] = registrationMatch
      ? [registrationMatch]
      : MOCK_COMPANIES.filter((company) => company.name.toLocaleLowerCase().includes(query));
    const startIndex = (page - 1) * pageSize;

    return of({
      items: matches.slice(startIndex, startIndex + pageSize),
      totalResults: matches.length,
      page,
      pageSize,
    }).pipe(delay(300));
  }
}
