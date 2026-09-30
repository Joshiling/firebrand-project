import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
  FormControl,
  FormGroup,
} from '@angular/forms';
import { catchError, map, of, Subject, switchMap } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideSearch, lucideSearchX } from '@ng-icons/lucide';
import { CompanySearchPage, CompanySearchRequest } from '../company.model';
import { CompanySearchService } from '../company-search.service';
import { CompanyResults } from '../company-results/company-results';
import { Pagination } from '../pagination/pagination';

function requiredTrimmed(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() ? null : { required: true };
}

type SearchOutcome = { kind: 'success'; result: CompanySearchPage } | { kind: 'error' };

const statusOptions = ['Active', 'Dissolved', 'Open', 'Closed', 'ConvertedClosed',
  'Receivership', 'Administration', 'Liquidation', 'InsolvencyProceedings',
  'VoluntaryArrangement', 'Registered', 'Removed'] as const;
const typeOptions = ['PrivateUnlimited', 'Ltd', 'Plc', 'OldPublicCompany',
  'PrivateLimitedGuarantorNscLimitedExemption', 'LimitedPartnership',
  'PrivateLimitedGuarantorNsc', 'ConvertedOrClosed', 'PrivateUnlimitedNsc',
  'PrivateLimitedSharesSection30Exemption', 'ProtectedCellCompany', 'AssuranceCompany',
  'OverseaCompany', 'Eeig', 'IcvcSecurities', 'IcvcWarrant', 'IcvcUmbrella',
  'RegisteredSocietyNonJurisdictional', 'IndustrialAndProvidentSociety',
  'NorthernIreland', 'NorthernIrelandOther', 'RoyalCharter',
  'InvestmentCompanyWithVariableCapital', 'UnregisteredCompany',
  'LimitedLiabilityPartnership', 'Other', 'EuropeanPublicLimitedLiabilityCompanySe',
  'UkEstablishment', 'ScottishPartnership'] as const;
const countryOptions = ['Wales', 'England', 'Scotland', 'GreatBritain',
  'NotSpecified', 'UnitedKingdom', 'NorthernIreland'] as const;

type SearchFilters = Pick<CompanySearchRequest, 'companyStatuses' | 'companyTypes' | 'country'>;

@Component({
  selector: 'app-company-search',
  imports: [ReactiveFormsModule, CompanyResults, Pagination, NgIcon],
  templateUrl: './company-search.html',
  styleUrl: './company-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideCircleAlert, lucideSearch, lucideSearchX })],
})
export class CompanySearch {
  private readonly searchService = inject(CompanySearchService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly requests = new Subject<CompanySearchRequest>();
  private lastSubmittedQuery = '';
  private submittedFilters: SearchFilters = {};
  private lastRequestedKey = '';

  protected readonly pageSize = 10;
  protected readonly statusOptions = statusOptions;
  protected readonly typeOptions = typeOptions;
  protected readonly countryOptions = countryOptions;
  protected readonly statusFilter = signal('');
  protected readonly typeFilter = signal('');
  protected readonly searchForm = new FormGroup({
    query: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, requiredTrimmed],
    }),
    companyStatuses: new FormControl<string[]>([], { nonNullable: true }),
    companyTypes: new FormControl<string[]>([], { nonNullable: true }),
    country: new FormControl('', { nonNullable: true }),
  });
  protected readonly visibleStatuses = computed(() => this.matchingOptions(
    statusOptions, this.statusFilter(), this.searchForm.controls.companyStatuses.value,
  ));
  protected readonly visibleTypes = computed(() => this.matchingOptions(
    typeOptions, this.typeFilter(), this.searchForm.controls.companyTypes.value,
  ));
  protected readonly result = signal<CompanySearchPage | null>(null);
  protected readonly loading = signal(false);
  protected readonly hasSearched = signal(false);
  protected readonly requestFailed = signal(false);
  protected readonly submittedQuery = signal('');
  protected readonly currentPage = signal(1);

  protected searchParams(): Record<string, string | number | readonly string[] | undefined> {
    return {
      q: this.lastSubmittedQuery, page: this.currentPage(),
      status: this.submittedFilters.companyStatuses,
      type: this.submittedFilters.companyTypes,
      country: this.submittedFilters.country,
    };
  }

  protected filterLabel(value: string): string {
    return value.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  private matchingOptions<T extends string>(options: readonly T[], text: string, selected: readonly string[]): readonly T[] {
    const search = text.trim().toLocaleLowerCase();
    return options.filter((option) => selected.includes(option)
      || this.filterLabel(option).toLocaleLowerCase().includes(search));
  }

  constructor() {
    // switchMap unsubscribes from an older request when a newer search starts. This prevents
    // a slow, stale response from replacing the results of the user's latest search.
    this.requests
      .pipe(
        switchMap((request) =>
          this.searchService.search(request).pipe(
            map((result): SearchOutcome => ({ kind: 'success', result })),
            catchError(() => of<SearchOutcome>({ kind: 'error' })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((outcome) => {
        this.loading.set(false);
        this.hasSearched.set(true);

        if (outcome.kind === 'error') {
          this.requestFailed.set(true);
          return;
        }

        this.result.set(outcome.result);
      });

    // The URL is the source of truth when the page is opened, refreshed, or reached with Back.
    // Restoring these values lets users return from a company profile without losing their search.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const query = params.get('q')?.trim() ?? '';
      if (!query) {
        return;
      }

      const requestedPage = Number(params.get('page'));
      const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
      const filters: SearchFilters = {
        ...this.selectedFilters(
          params.getAll('status').filter((value) => statusOptions.includes(value as typeof statusOptions[number])),
          params.getAll('type').filter((value) => typeOptions.includes(value as typeof typeOptions[number])),
          countryOptions.includes(params.get('country') as typeof countryOptions[number])
            ? params.get('country')! : '',
        ),
      };
      const requestKey = this.requestKey(query, page, filters);

      this.searchForm.setValue({ query, companyStatuses: [...(filters.companyStatuses ?? [])],
        companyTypes: [...(filters.companyTypes ?? [])], country: filters.country ?? '' });
      this.lastSubmittedQuery = query;
      this.submittedFilters = filters;
      this.submittedQuery.set(query);
      this.currentPage.set(page);

      // Updating the URL after a search emits queryParamMap again. The key avoids sending the
      // same request twice while still allowing Back/Forward to load a different query or page.
      if (requestKey !== this.lastRequestedKey) {
        this.requestPage(page);
      }
    });
  }

  protected submitSearch(): void {
    this.searchForm.controls.query.markAsTouched();
    this.searchForm.controls.query.updateValueAndValidity();

    if (this.searchForm.invalid) {
      return;
    }

    this.lastSubmittedQuery = this.searchForm.controls.query.value.trim();
    const { companyStatuses, companyTypes, country } = this.searchForm.getRawValue();
    this.submittedFilters = this.selectedFilters(companyStatuses, companyTypes, country);
    this.submittedQuery.set(this.lastSubmittedQuery);
    this.currentPage.set(1);
    this.requestPage(1);
    this.updateSearchUrl(1);
  }

  protected changePage(page: number): void {
    if (!this.loading() && this.lastSubmittedQuery) {
      this.currentPage.set(page);
      this.requestPage(page);
      this.updateSearchUrl(page);
    }
  }

  private requestPage(page: number): void {
    this.lastRequestedKey = this.requestKey(this.lastSubmittedQuery, page, this.submittedFilters);
    this.loading.set(true);
    this.hasSearched.set(false);
    this.requestFailed.set(false);
    this.result.set(null);
    this.requests.next({ query: this.lastSubmittedQuery, page, pageSize: this.pageSize,
      ...this.submittedFilters });
  }

  private requestKey(query: string, page: number, filters: SearchFilters): string {
    return JSON.stringify([query.toLocaleLowerCase(), page, filters.companyStatuses,
      filters.companyTypes, filters.country]);
  }

  private selectedFilters(statuses: string[], types: string[], country: string): SearchFilters {
    return {
      ...(statuses.length ? { companyStatuses: [...statuses] } : {}),
      ...(types.length ? { companyTypes: [...types] } : {}),
      ...(country ? { country } : {}),
    };
  }

  private updateSearchUrl(page: number): void {
    // replaceUrl keeps pagination/search updates from filling browser history with intermediate
    // entries. The details page still creates a normal history entry, so Back returns here.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.searchParams(),
      replaceUrl: true,
    });
  }
}
