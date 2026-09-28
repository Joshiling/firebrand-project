import { Observable } from 'rxjs';
import { CompaniesHouseCompanyProfile } from './companies-house-profile';
import { CompanySearchPage, CompanySearchRequest } from './company.model';

export abstract class CompanySearchService {
  abstract search(request: CompanySearchRequest): Observable<CompanySearchPage>;
  abstract getDetails(registrationNumber: string): Observable<CompaniesHouseCompanyProfile | null>;
}
