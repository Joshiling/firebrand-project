import { Observable } from 'rxjs';
import { CompaniesHouseCompanyProfile } from './companies-house-profile';
import {
  CompanyFilterOptions,
  CompanyHistoryEntry,
  CompanySearchPage,
  CompanySearchRequest,
} from './company.model';

// Components depend on this contract rather than a concrete data source. Replacing the mock with
// an HttpClient implementation therefore does not require changes to the search or details views.
export abstract class CompanySearchService {
  // Lists the status, type, and country filters that searches can use.
  abstract getFilterOptions(): Observable<CompanyFilterOptions>;
  // Finds matching companies and returns the requested page of summaries.
  abstract search(request: CompanySearchRequest): Observable<CompanySearchPage>;
  // Retrieves one company's full profile or reports that it was not found.
  abstract getDetails(registrationNumber: string): Observable<CompaniesHouseCompanyProfile | null>;
  // Retrieves the saved versions of a company's profile.
  abstract getHistory(registrationNumber: string): Observable<readonly CompanyHistoryEntry[]>;
}
