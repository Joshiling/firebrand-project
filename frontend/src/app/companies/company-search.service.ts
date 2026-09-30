import { Observable } from 'rxjs';
import { CompaniesHouseCompanyProfile } from './companies-house-profile';
import { CompanyHistoryEntry, CompanySearchPage, CompanySearchRequest } from './company.model';

// Components depend on this contract rather than a concrete data source. Replacing the mock with
// an HttpClient implementation therefore does not require changes to the search or details views.
export abstract class CompanySearchService {
  abstract search(request: CompanySearchRequest): Observable<CompanySearchPage>;
  abstract getDetails(registrationNumber: string): Observable<CompaniesHouseCompanyProfile | null>;
  abstract getHistory(registrationNumber: string): Observable<readonly CompanyHistoryEntry[]>;
}
