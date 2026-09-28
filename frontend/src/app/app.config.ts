import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { CompanySearchService } from './companies/company-search.service';
import { MockCompanySearchService } from './companies/mock-company-search.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: CompanySearchService, useClass: MockCompanySearchService },
  ],
};
