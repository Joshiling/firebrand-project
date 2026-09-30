import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import { CompaniesHouseCompanyProfile, mapCompaniesHouseProfile } from './companies-house-profile';
import {
  CompanyFilterOptions,
  CompanyHistoryEntry,
  CompanySearchPage,
  CompanySearchRequest,
  CompanySummary,
} from './company.model';
import { classifyCompanyQuery } from './company-query';
import { CompanySearchService } from './company-search.service';
import { MOCK_COMPANY_HISTORY, MOCK_COMPANY_PROFILES } from './mock-companies';

@Injectable()
export class MockCompanySearchService extends CompanySearchService {
  override getFilterOptions(): Observable<CompanyFilterOptions> {
    return of({ companyStatuses: ['Active', 'Dissolved'], companyTypes: ['Ltd', 'Plc'], countries: ['England'] });
  }

  override getHistory(registrationNumber: string): Observable<readonly CompanyHistoryEntry[]> {
    const normalizedNumber = registrationNumber.trim().toLocaleUpperCase();
    return of(MOCK_COMPANY_HISTORY[normalizedNumber] ?? []).pipe(delay(200));
  }

  override getDetails(registrationNumber: string): Observable<CompaniesHouseCompanyProfile | null> {
    const normalizedNumber = registrationNumber.trim().toLocaleLowerCase();
    const profile =
      MOCK_COMPANY_PROFILES.find(
        (company) => company.company_number.toLocaleLowerCase() === normalizedNumber,
      ) ?? null;

    // A short delay makes loading and cancellation behavior realistic while using local fixtures.
    return of(profile).pipe(delay(250));
  }

  override search(request: CompanySearchRequest): Observable<CompanySearchPage> {
    const query = request.query.trim().toLocaleLowerCase();
    const page = Math.max(1, request.page);
    const pageSize = Math.max(1, request.pageSize);
    const queryKind = classifyCompanyQuery(query);
    // Registration-number searches are exact; name searches intentionally support partial text.
    const matchingProfiles =
      queryKind === 'registrationNumber'
        ? MOCK_COMPANY_PROFILES.filter(
            (company) => company.company_number.toLocaleLowerCase() === query,
          )
        : MOCK_COMPANY_PROFILES.filter((company) =>
            company.company_name.toLocaleLowerCase().includes(query),
          );
    // The mock advertises only simple enum names whose wire values differ by case.
    // Missing profile fields cannot satisfy an explicit filter; never infer a country.
    const filteredProfiles = matchingProfiles.filter((company) =>
      (!request.companyStatuses?.length || request.companyStatuses.some(
        (status) => status.toLowerCase() === company.company_status?.toLowerCase(),
      )) &&
      (!request.companyTypes?.length || request.companyTypes.some(
        (type) => type.toLowerCase() === company.type?.toLowerCase(),
      )) &&
      (!request.country || request.country.toLowerCase() ===
        company.registered_office_address?.country?.toLowerCase()),
    );
    const matches: readonly CompanySummary[] = filteredProfiles.map(mapCompaniesHouseProfile);
    const startIndex = (page - 1) * pageSize;

    // Match the HTTP adapter: totals describe all matches, not just the requested slice.
    return of({
      items: matches.slice(startIndex, startIndex + pageSize),
      totalResults: matches.length,
      page,
      pageSize,
    }).pipe(delay(300));
  }
}
