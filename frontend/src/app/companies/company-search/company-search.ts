import { ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
  FormControl,
  FormGroup,
} from '@angular/forms';
import { catchError, EMPTY, map, of, startWith, Subject, switchMap } from 'rxjs';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronDown, lucideCircleAlert, lucideSearch, lucideSearchX } from '@ng-icons/lucide';
import { CompanyFilterOptions, CompanySearchPage, CompanySearchRequest } from '../company.model';
import { CompanySearchService } from '../company-search.service';
import { CompanyResults } from '../company-results/company-results';
import { Pagination } from '../pagination/pagination';

function requiredTrimmed(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() ? null : { required: true };
}

type SearchOutcome = { kind: 'success'; result: CompanySearchPage } | { kind: 'error' };

type SearchFilters = Pick<CompanySearchRequest, 'companyStatuses' | 'companyTypes' | 'country'>;

@Component({
  selector: 'app-company-search',
  imports: [ReactiveFormsModule, CompanyResults, Pagination, NgIcon],
  templateUrl: './company-search.html',
  styleUrl: './company-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideCheck, lucideChevronDown, lucideCircleAlert, lucideSearch, lucideSearchX })],
})
export class CompanySearch {
  private readonly searchService = inject(CompanySearchService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly requests = new Subject<CompanySearchRequest | null>();
  private readonly filterRequests = new Subject<void>();
  private readonly statusPicker = viewChild<ElementRef<HTMLDetailsElement>>('statusPicker');
  private readonly typePicker = viewChild<ElementRef<HTMLDetailsElement>>('typePicker');
  private lastSubmittedQuery = '';
  private submittedFilters: SearchFilters = {};
  private lastRequestedKey = '';

  protected readonly pageSize = 10;
  protected readonly filterOptions = signal<CompanyFilterOptions | null>(null);
  protected readonly filtersFailed = signal(false);
  protected readonly statusFilter = signal('');
  protected readonly typeFilter = signal('');
  protected readonly searchForm = new FormGroup({
    query: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, requiredTrimmed],
    }),
    companyStatuses: new FormControl<string[]>([''], { nonNullable: true }),
    companyTypes: new FormControl<string[]>([''], { nonNullable: true }),
    country: new FormControl('', { nonNullable: true }),
  });
  // URL restoration changes form values without changing the option-search text.
  // Track selections reactively so selected options remain visible in a filtered list.
  private readonly selectedStatuses = toSignal(this.searchForm.controls.companyStatuses.valueChanges, {
    initialValue: this.searchForm.controls.companyStatuses.value,
  });
  private readonly selectedTypes = toSignal(this.searchForm.controls.companyTypes.valueChanges, {
    initialValue: this.searchForm.controls.companyTypes.value,
  });
  protected readonly visibleStatuses = computed(() => this.matchingOptions(
    this.filterOptions()?.companyStatuses ?? [], this.statusFilter(), this.selectedStatuses(),
  ));
  protected readonly visibleTypes = computed(() => this.matchingOptions(
    this.filterOptions()?.companyTypes ?? [], this.typeFilter(), this.selectedTypes(),
  ));
  protected readonly result = signal<CompanySearchPage | null>(null);
  protected readonly loading = signal(false);
  protected readonly hasSearched = signal(false);
  protected readonly requestFailed = signal(false);
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

  protected selectionLabel(values: readonly string[], fallback: string): string {
    return values.filter(Boolean).map((value) => this.filterLabel(value)).join(', ') || fallback;
  }

  protected selectStatus(value: string, picker: HTMLDetailsElement): void {
    this.selectOption(this.searchForm.controls.companyStatuses, value, picker);
    this.statusFilter.set('');
  }

  protected selectType(value: string, picker: HTMLDetailsElement): void {
    this.selectOption(this.searchForm.controls.companyTypes, value, picker);
    this.typeFilter.set('');
  }

  protected closeOtherPicker(picker: HTMLDetailsElement): void {
    if (picker.open) {
      const other = picker === this.statusPicker()?.nativeElement
        ? this.typePicker()?.nativeElement : this.statusPicker()?.nativeElement;
      if (other) {
        other.open = false;
      }
    }
  }

  @HostListener('document:click', ['$event'])
  protected closePickersOutside(event: MouseEvent): void {
    for (const picker of [this.statusPicker()?.nativeElement, this.typePicker()?.nativeElement]) {
      if (picker && !picker.contains(event.target as Node)) {
        picker.open = false;
      }
    }
  }

  @HostListener('document:keydown.escape')
  protected closePickersOnEscape(): void {
    for (const picker of [this.statusPicker()?.nativeElement, this.typePicker()?.nativeElement]) {
      if (picker?.open) {
        picker.open = false;
        picker.querySelector('summary')?.focus();
      }
    }
  }

  protected clearFilters(): void {
    this.searchForm.patchValue({ companyStatuses: [''], companyTypes: [''], country: '' });
    this.statusFilter.set('');
    this.typeFilter.set('');
  }

  protected retryFilterOptions(): void {
    this.filtersFailed.set(false);
    this.filterRequests.next();
  }

  private selectOption(control: FormControl<string[]>, value: string, picker: HTMLDetailsElement): void {
    const selected = control.value.filter(Boolean);
    const next = selected.includes(value)
      ? selected.filter((item) => item !== value) : [...selected, value];
    control.setValue(value && next.length ? next : ['']);
    picker.open = false;
    picker.querySelector('summary')?.focus();
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
          request === null ? EMPTY : this.searchService.search(request).pipe(
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
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => this.restoreFromUrl(params));

    this.filterRequests.pipe(
      startWith(undefined),
      switchMap(() => this.searchService.getFilterOptions().pipe(
        catchError(() => {
          this.filtersFailed.set(true);
          return EMPTY;
        }),
      )),
      takeUntilDestroyed(),
    ).subscribe((options) => {
        this.filterOptions.set(options);
        this.filtersFailed.set(false);
        const params = this.route.snapshot.queryParamMap;
        if (params.has('status') || params.has('type') || params.has('country')) {
          this.restoreFromUrl(params);
        }
    });
  }

  private restoreFromUrl(params: ParamMap): void {
      const query = params.get('q')?.trim() ?? '';
      if (!query) {
        // Reset through switchMap as well as the view, so a late response cannot revive it.
        this.requests.next(null);
        this.lastSubmittedQuery = '';
        this.submittedFilters = {};
        this.lastRequestedKey = '';
        this.searchForm.reset({ query: '', companyStatuses: [''], companyTypes: [''], country: '' });
        this.statusFilter.set('');
        this.typeFilter.set('');
        this.currentPage.set(1);
        this.result.set(null);
        this.loading.set(false);
        this.hasSearched.set(false);
        this.requestFailed.set(false);
        return;
      }

      const options = this.filterOptions();
      if (!options && (params.has('status') || params.has('type') || params.has('country'))) {
        return;
      }

      const requestedPage = Number(params.get('page'));
      const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
      const filters: SearchFilters = {
        ...this.selectedFilters(
          params.getAll('status').filter((value) => options?.companyStatuses.includes(value)),
          params.getAll('type').filter((value) => options?.companyTypes.includes(value)),
          options?.countries.includes(params.get('country') ?? '')
            ? params.get('country')! : '',
        ),
      };
      const requestKey = this.requestKey(query, page, filters);

      const companyStatuses = filters.companyStatuses?.length ? [...filters.companyStatuses] : [''];
      const companyTypes = filters.companyTypes?.length ? [...filters.companyTypes] : [''];
      this.searchForm.setValue({ query, companyStatuses, companyTypes, country: filters.country ?? '' });
      this.lastSubmittedQuery = query;
      this.submittedFilters = filters;
      this.currentPage.set(page);

      // Updating the URL after a search emits queryParamMap again. The key avoids sending the
      // same request twice while still allowing Back/Forward to load a different query or page.
      if (requestKey !== this.lastRequestedKey) {
        this.requestPage(page);
      }
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
    const selectedStatuses = statuses.filter(Boolean);
    const selectedTypes = types.filter(Boolean);
    return {
      ...(selectedStatuses.length ? { companyStatuses: selectedStatuses } : {}),
      ...(selectedTypes.length ? { companyTypes: selectedTypes } : {}),
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
