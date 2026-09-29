import { Routes } from '@angular/router';
import { CompanyDetails } from './companies/company-details/company-details';
import { CompanySearch } from './companies/company-search/company-search';

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
    path: '**',
    redirectTo: '',
  },
];
