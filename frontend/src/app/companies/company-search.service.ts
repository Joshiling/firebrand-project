import { Observable } from 'rxjs';
import { CompanySearchPage, CompanySearchRequest } from './company.model';

export abstract class CompanySearchService {
  abstract search(request: CompanySearchRequest): Observable<CompanySearchPage>;
}
