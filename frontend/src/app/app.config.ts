import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { CompanySearchService } from './companies/company-search.service';
import { MockCompanySearchService } from './companies/mock-company-search.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: CompanySearchService, useClass: MockCompanySearchService },
  ],
};
