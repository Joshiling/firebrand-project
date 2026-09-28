import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import { CompaniesHouseCompanyProfile, mapCompaniesHouseProfile } from './companies-house-profile';
import { CompanySearchPage, CompanySearchRequest, CompanySummary } from './company.model';
import { classifyCompanyQuery } from './company-query';
import { CompanySearchService } from './company-search.service';
import { MOCK_COMPANY_PROFILES } from './mock-companies';

@Injectable()
export class MockCompanySearchService extends CompanySearchService {
  override getDetails(registrationNumber: string): Observable<CompaniesHouseCompanyProfile | null> {
    const normalizedNumber = registrationNumber.trim().toLocaleLowerCase();
    const profile =
      MOCK_COMPANY_PROFILES.find(
        (company) => company.company_number.toLocaleLowerCase() === normalizedNumber,
      ) ?? null;

    return of(profile).pipe(delay(250));
  }

  override search(request: CompanySearchRequest): Observable<CompanySearchPage> {
    const query = request.query.trim().toLocaleLowerCase();
    const page = Math.max(1, request.page);
    const pageSize = Math.max(1, request.pageSize);
    const queryKind = classifyCompanyQuery(query);
    const matchingProfiles =
      queryKind === 'registrationNumber'
        ? MOCK_COMPANY_PROFILES.filter(
            (company) => company.company_number.toLocaleLowerCase() === query,
          )
        : MOCK_COMPANY_PROFILES.filter((company) =>
            company.company_name.toLocaleLowerCase().includes(query),
          );
    const matches: readonly CompanySummary[] = matchingProfiles.map(mapCompaniesHouseProfile);
    const startIndex = (page - 1) * pageSize;

    return of({
      items: matches.slice(startIndex, startIndex + pageSize),
      totalResults: matches.length,
      page,
      pageSize,
    }).pipe(delay(300));
  }
}
