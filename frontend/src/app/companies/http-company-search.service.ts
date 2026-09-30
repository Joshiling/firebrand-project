import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { CompaniesHouseCompanyProfile } from './companies-house-profile';
import { CompanySearchPage, CompanySearchRequest, CompanySummary } from './company.model';
import { classifyCompanyQuery } from './company-query';
import { CompanySearchService } from './company-search.service';

interface BackendCompanySearch {
  name: string;
  registryId: string;
  address?: string;
  companyStatus?: string;
  companyType?: string;
}

interface BackendRegisteredOfficeAddress {
  addressLine1?: string;
  addressLine2?: string;
  country?: string;
  locality?: string;
  postalCode?: string;
  region?: string;
}

interface BackendCompany extends BackendCompanySearch {
  accounts?: {
    accountingReferenceDate?: { day?: string; month?: string };
    lastAccounts?: {
      madeUpTo?: string;
      periodEndOn?: string;
      periodStartOn?: string;
      type?: string;
    };
    nextAccounts?: {
      dueOn?: string;
      overdue?: boolean;
      periodEndOn?: string;
      periodStartOn?: string;
    };
    nextDue?: string;
    nextMadeUpTo?: string;
    overdue?: boolean;
  };
  canFile?: boolean;
  confirmationStatement?: {
    lastMadeUpTo?: string;
    nextDue?: string;
    nextMadeUpTo?: string;
    overdue?: boolean;
  };
  dateOfCreation?: string;
  etag?: string;
  hasCharges?: boolean;
  hasInsolvencyHistory?: boolean;
  hasSuperSecurePscs?: boolean;
  jurisdiction?: string;
  lastFullMembersListDate?: string;
  links?: Record<string, string>;
  previousCompanyNames?: readonly {
    ceasedOn?: string;
    effectiveFrom?: string;
    name?: string;
  }[];
  registeredOfficeAddress?: BackendRegisteredOfficeAddress;
  registeredOfficeIsInDispute?: boolean;
  sicCodes?: readonly string[];
  undeliverableRegisteredOfficeAddress?: boolean;
}

@Injectable()
export class HttpCompanySearchService extends CompanySearchService {
  private readonly http = inject(HttpClient);

  override search(request: CompanySearchRequest): Observable<CompanySearchPage> {
    const query = request.query.trim();
    const page = Math.max(1, request.page);
    const pageSize = Math.max(1, request.pageSize);
    const isRegistrationNumber = classifyCompanyQuery(query) === 'registrationNumber';
    const endpoint = isRegistrationNumber ? '/registry_id' : '/name';
    const parameterName = isRegistrationNumber ? 'registry_id' : 'name';
    let params = new HttpParams().set(parameterName, query);
    for (const status of request.companyStatuses ?? []) {
      params = params.append('company_status', status);
    }
    for (const type of request.companyTypes ?? []) {
      params = params.append('company_type', type);
    }
    if (request.country) {
      params = params.set('country', request.country);
    }

    return this.http.get<readonly BackendCompanySearch[]>(endpoint, { params }).pipe(
      map((companies) => {
        const startIndex = (page - 1) * pageSize;
        const items = companies
          .slice(startIndex, startIndex + pageSize)
          .map((company) => this.toSummary(company));

        return {
          items,
          totalResults: companies.length,
          page,
          pageSize,
        };
      }),
    );
  }

  override getDetails(registrationNumber: string): Observable<CompaniesHouseCompanyProfile | null> {
    const encodedNumber = encodeURIComponent(registrationNumber.trim());

    return this.http.get<BackendCompany>(`/registry_id/${encodedNumber}`).pipe(
      map((company) => this.toProfile(company)),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          return of(null);
        }

        return throwError(() => error);
      }),
    );
  }

  private toSummary(company: BackendCompanySearch): CompanySummary {
    return {
      name: company.name,
      registrationNumber: company.registryId,
      status: company.companyStatus,
      type: company.companyType,
      registeredAddress: company.address ? { addressLine1: company.address } : undefined,
    };
  }

  private toProfile(company: BackendCompany): CompaniesHouseCompanyProfile {
    return {
      accounts: company.accounts
        ? {
            accounting_reference_date: company.accounts.accountingReferenceDate
              ? {
                  day: company.accounts.accountingReferenceDate.day ?? '',
                  month: company.accounts.accountingReferenceDate.month ?? '',
                }
              : undefined,
            last_accounts: company.accounts.lastAccounts
              ? {
                  made_up_to: company.accounts.lastAccounts.madeUpTo,
                  period_end_on: company.accounts.lastAccounts.periodEndOn,
                  period_start_on: company.accounts.lastAccounts.periodStartOn,
                  type: company.accounts.lastAccounts.type,
                }
              : undefined,
            next_accounts: company.accounts.nextAccounts
              ? {
                  due_on: company.accounts.nextAccounts.dueOn,
                  overdue: company.accounts.nextAccounts.overdue,
                  period_end_on: company.accounts.nextAccounts.periodEndOn,
                  period_start_on: company.accounts.nextAccounts.periodStartOn,
                }
              : undefined,
            next_due: company.accounts.nextDue,
            next_made_up_to: company.accounts.nextMadeUpTo,
            overdue: company.accounts.overdue,
          }
        : undefined,
      can_file: company.canFile,
      company_name: company.name,
      company_number: company.registryId,
      company_status: company.companyStatus,
      confirmation_statement: company.confirmationStatement
        ? {
            last_made_up_to: company.confirmationStatement.lastMadeUpTo,
            next_due: company.confirmationStatement.nextDue,
            next_made_up_to: company.confirmationStatement.nextMadeUpTo,
            overdue: company.confirmationStatement.overdue,
          }
        : undefined,
      type: company.companyType,
      date_of_creation: company.dateOfCreation,
      etag: company.etag,
      has_charges: company.hasCharges,
      has_insolvency_history: company.hasInsolvencyHistory,
      has_super_secure_pscs: company.hasSuperSecurePscs,
      jurisdiction: company.jurisdiction,
      last_full_members_list_date: company.lastFullMembersListDate,
      links: company.links,
      previous_company_names: company.previousCompanyNames?.map((previousName) => ({
        ceased_on: previousName.ceasedOn,
        effective_from: previousName.effectiveFrom,
        name: previousName.name ?? 'Not available',
      })),
      registered_office_address: company.registeredOfficeAddress
        ? {
            address_line_1: company.registeredOfficeAddress.addressLine1,
            address_line_2: company.registeredOfficeAddress.addressLine2,
            country: company.registeredOfficeAddress.country,
            locality: company.registeredOfficeAddress.locality,
            postal_code: company.registeredOfficeAddress.postalCode,
            region: company.registeredOfficeAddress.region,
          }
        : company.address
          ? { address_line_1: company.address }
          : undefined,
      registered_office_is_in_dispute: company.registeredOfficeIsInDispute,
      sic_codes: company.sicCodes,
      undeliverable_registered_office_address: company.undeliverableRegisteredOfficeAddress,
    };
  }
}
