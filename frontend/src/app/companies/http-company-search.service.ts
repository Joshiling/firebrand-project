import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { CompaniesHouseCompanyProfile } from './companies-house-profile';
import {
  CompanyFilterOptions,
  CompanyHistoryEntry,
  CompanySearchPage,
  CompanySearchRequest,
  CompanySummary,
} from './company.model';
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
  address_line_1?: string;
  address_line_2?: string;
  country?: string;
  locality?: string;
  postal_code?: string;
  region?: string;
}

// Top-level model properties are camelCase; reused upstream DTOs retain JsonPropertyName names.
interface BackendCompany extends BackendCompanySearch {
  version_count?: number;
  accounts?: {
    accounting_reference_date?: { day?: string; month?: string };
    last_accounts?: {
      made_up_to?: string;
      period_end_on?: string;
      period_start_on?: string;
      type?: string;
    };
    next_accounts?: {
      due_on?: string;
      overdue?: boolean;
      period_end_on?: string;
      period_start_on?: string;
    };
    next_due?: string;
    next_made_up_to?: string;
    overdue?: boolean;
  };
  canFile?: boolean;
  confirmationStatement?: {
    last_made_up_to?: string;
    next_due?: string;
    next_made_up_to?: string;
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
    ceased_on?: string;
    effective_from?: string;
    name?: string;
  }[];
  registeredOfficeAddress?: BackendRegisteredOfficeAddress;
  registeredOfficeIsInDispute?: boolean;
  sicCodes?: readonly string[];
  undeliverableRegisteredOfficeAddress?: boolean;
}

interface BackendCompanyHistoryEntry {
  version_number: number;
  recorded_at: string;
  company_number: string;
  company_name: string;
  company_status?: string;
  incorporation_date?: string;
  address?: string;
  external_registration_number?: string;
}

@Injectable()
export class HttpCompanySearchService extends CompanySearchService {
  private readonly http = inject(HttpClient);

  // Loads the filter values accepted by the backend search endpoints.
  override getFilterOptions(): Observable<CompanyFilterOptions> {
    return this.http.get<CompanyFilterOptions>('/search/filters');
  }

  // Selects the name or number endpoint and pages the returned company summaries.
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
        // The API returns a bounded result list; page only after retaining that list's total.
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

  // Loads a company profile, treating only HTTP 404 as a missing company.
  override getDetails(registrationNumber: string): Observable<CompaniesHouseCompanyProfile | null> {
    const encodedNumber = encodeURIComponent(registrationNumber.trim());

    return this.http.get<BackendCompany>(`/registry_id/${encodedNumber}`).pipe(
      map((company) => this.toProfile(company)),
      catchError((error: unknown) => {
        // An absent profile is a view state; transport and service failures remain errors.
        if (error instanceof HttpErrorResponse && error.status === 404) {
          return of(null);
        }

        return throwError(() => error);
      }),
    );
  }

  // Loads saved profile versions, returning an empty list when no history exists.
  override getHistory(registrationNumber: string): Observable<readonly CompanyHistoryEntry[]> {
    const encodedNumber = encodeURIComponent(registrationNumber.trim());

    return this.http
      .get<readonly BackendCompanyHistoryEntry[]>(`/registry_id/${encodedNumber}/history`)
      .pipe(
        map((entries) =>
          entries.map((entry) => ({
            versionNumber: entry.version_number,
            recordedAt: entry.recorded_at,
            companyNumber: entry.company_number,
            companyName: entry.company_name,
            companyStatus: entry.company_status,
            incorporationDate: entry.incorporation_date,
            address: entry.address,
            externalRegistrationNumber: entry.external_registration_number,
          })),
        ),
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 404) {
            return of([]);
          }

          return throwError(() => error);
        }),
      );
  }

  // Converts a backend search result to the summary displayed in results.
  private toSummary(company: BackendCompanySearch): CompanySummary {
    return {
      name: company.name,
      registrationNumber: company.registryId,
      status: company.companyStatus,
      type: company.companyType,
      registeredAddress: company.address ? { addressLine1: company.address } : undefined,
    };
  }

  // Translates the backend's mixed JSON field names into the profile view model.
  private toProfile(company: BackendCompany): CompaniesHouseCompanyProfile {
    return {
      accounts: company.accounts
        ? {
            accounting_reference_date: company.accounts.accounting_reference_date
              ? {
                  day: company.accounts.accounting_reference_date.day ?? '',
                  month: company.accounts.accounting_reference_date.month ?? '',
                }
              : undefined,
            last_accounts: company.accounts.last_accounts
              ? {
                  made_up_to: company.accounts.last_accounts.made_up_to,
                  period_end_on: company.accounts.last_accounts.period_end_on,
                  period_start_on: company.accounts.last_accounts.period_start_on,
                  type: company.accounts.last_accounts.type,
                }
              : undefined,
            next_accounts: company.accounts.next_accounts
              ? {
                  due_on: company.accounts.next_accounts.due_on,
                  overdue: company.accounts.next_accounts.overdue,
                  period_end_on: company.accounts.next_accounts.period_end_on,
                  period_start_on: company.accounts.next_accounts.period_start_on,
                }
              : undefined,
            next_due: company.accounts.next_due,
            next_made_up_to: company.accounts.next_made_up_to,
            overdue: company.accounts.overdue,
          }
        : undefined,
      can_file: company.canFile,
      company_name: company.name,
      company_number: company.registryId,
      company_status: company.companyStatus,
      confirmation_statement: company.confirmationStatement
        ? {
            last_made_up_to: company.confirmationStatement.last_made_up_to,
            next_due: company.confirmationStatement.next_due,
            next_made_up_to: company.confirmationStatement.next_made_up_to,
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
        ceased_on: previousName.ceased_on,
        effective_from: previousName.effective_from,
        name: previousName.name ?? 'Not available',
      })),
      registered_office_address: company.registeredOfficeAddress
        ? {
            address_line_1: company.registeredOfficeAddress.address_line_1,
            address_line_2: company.registeredOfficeAddress.address_line_2,
            country: company.registeredOfficeAddress.country,
            locality: company.registeredOfficeAddress.locality,
            postal_code: company.registeredOfficeAddress.postal_code,
            region: company.registeredOfficeAddress.region,
          }
        : company.address
          ? { address_line_1: company.address }
          : undefined,
      registered_office_is_in_dispute: company.registeredOfficeIsInDispute,
      sic_codes: company.sicCodes,
      undeliverable_registered_office_address: company.undeliverableRegisteredOfficeAddress,
      version_count: company.version_count,
    };
  }
}
