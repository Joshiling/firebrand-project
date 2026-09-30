import { Routes } from '@angular/router';
import { CompanyDetails } from './companies/company-details/company-details';
import { CompanySearch } from './companies/company-search/company-search';
import { SearchLogs } from './search-logs/search-logs';

export const routes: Routes = [
  {
    path: '',
    component: CompanySearch,
    title: 'Company search | CompanyLens',
  },
  {
    path: 'companies/:registrationNumber',
    component: CompanyDetails,
  },
  {
    path: 'logs',
    component: SearchLogs,
    title: 'Search activity | CompanyLens',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
