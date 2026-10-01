import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { delay, Observable, of, Subject, throwError } from 'rxjs';
import { CompanyFilterOptions, CompanySearchPage, CompanySearchRequest } from '../company.model';
import { CompanySearchService } from '../company-search.service';
import { CompanySearch } from './company-search';

class SearchServiceStub extends CompanySearchService {
  optionsResponse?: Observable<CompanyFilterOptions>;
  options: CompanyFilterOptions = {
    companyStatuses: ['Active', 'Dissolved'],
    companyTypes: ['PrivateUnlimited', 'Ltd', 'Plc', 'LimitedPartnership'],
    countries: ['England', 'GreatBritain'],
  };
  // Supplies selectable filter metadata or a test-controlled response.
  override getFilterOptions(): Observable<CompanyFilterOptions> {
    return this.optionsResponse ?? of(this.options);
  }

  response: CompanySearchPage = {
    items: [
      {
        name: 'Tesco PLC',
        registrationNumber: '00445790',
        status: 'Active',
        type: 'Public limited company',
      },
    ],
    totalResults: 1,
    page: 1,
    pageSize: 10,
  };
  shouldFail = false;

  // Details are outside the search component's responsibility.
  override getDetails() {
    return of(null);
  }

  // History is outside the search component's responsibility.
  override getHistory() {
    return of([]);
  }

  // Records searches and optionally simulates a delayed service failure.
  override readonly search = vi.fn(
    (request: CompanySearchRequest): Observable<CompanySearchPage> => {
      if (this.shouldFail) {
        return throwError(() => new Error('Service unavailable'));
      }

      return of({ ...this.response, page: request.page }).pipe(delay(10));
    },
  );
}

describe('CompanySearch', () => {
  let fixture: ComponentFixture<CompanySearch>;
  let service: SearchServiceStub;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [CompanySearch],
      providers: [
        provideRouter([]),
        { provide: CompanySearchService, useClass: SearchServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CompanySearch);
    service = TestBed.inject(CompanySearchService) as SearchServiceStub;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Types into the search control and notifies Angular of the input change.
  function setQuery(value: string): void {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  // Submits the search form through the same event as the UI.
  function submit(): void {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  // Finds the requested filter's enclosing dropdown.
  function picker(kind: 'status' | 'type'): HTMLDetailsElement {
    return fixture.nativeElement.querySelector(`#filter-${kind}`)?.closest('details') as HTMLDetailsElement;
  }

  // Opens a filter picker and selects an option by its visible label.
  function choose(kind: 'status' | 'type', label: string): void {
    const dropdown = picker(kind);
    dropdown.open = true;
    fixture.detectChanges();
    const option = Array.from(dropdown.querySelectorAll('.filter-picker__list button') as NodeListOf<HTMLButtonElement>)
      .find((button) => button.textContent?.trim() === label);
    expect(option).toBeDefined();
    option!.click();
    fixture.detectChanges();
    expect(dropdown.open).toBe(false);
  }

  // Advances the stub response delay and updates the rendered search view.
  async function finishRequest(): Promise<void> {
    await vi.advanceTimersByTimeAsync(10);
    fixture.detectChanges();
  }

  it('prevents a whitespace-only search and shows a useful message', () => {
    setQuery('   ');
    submit();

    expect(service.search).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(
      'Enter a company name or registration number.',
    );
  });

  it('shows company information returned by the service', async () => {
    setQuery('Tesco');
    submit();
    expect(fixture.nativeElement.textContent).toContain('Searching company records');

    await finishRequest();

    expect(service.search).toHaveBeenCalledWith({ query: 'Tesco', page: 1, pageSize: 10 });
    expect(fixture.nativeElement.textContent).toContain('Tesco PLC');
    expect(fixture.nativeElement.textContent).toContain('00445790');
    expect(fixture.nativeElement.textContent).toContain('Not available');
  });

  it('shows an empty state when no companies match', async () => {
    service.response = { items: [], totalResults: 0, page: 1, pageSize: 10 };
    setQuery('Unknown');
    submit();
    await finishRequest();

    expect(fixture.nativeElement.textContent).toContain('No companies found');
  });

  it('shows a recoverable service error', () => {
    service.shouldFail = true;
    setQuery('Tesco');
    submit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('We could not complete the search');
  });

  it('requests the next page using the submitted query', async () => {
    service.response = {
      ...service.response,
      totalResults: 23,
      items: Array.from({ length: 10 }, (_, index) => ({
        name: `Northstar ${index + 1} Limited`,
        registrationNumber: String(1000000 + index).padStart(8, '0'),
      })),
    };
    setQuery('Northstar');
    submit();
    await finishRequest();

    setQuery('edited but not submitted');
    const nextButton = Array.from(
      fixture.nativeElement.querySelectorAll(
        'app-pagination button',
      ) as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Next'));
    nextButton?.click();

    expect(service.search).toHaveBeenLastCalledWith({ query: 'Northstar', page: 2, pageSize: 10 });
  });

  it('keeps submitted filters on pagination and in the company link', async () => {
    service.response = { ...service.response, totalResults: 23 };
    setQuery('Northstar');
    choose('status', 'Active');
    choose('status', 'Dissolved');
    const country = fixture.nativeElement.querySelector('#filter-country') as HTMLSelectElement;
    country.value = 'England';
    country.dispatchEvent(new Event('change'));
    submit();
    await finishRequest();

    expect(service.search).toHaveBeenLastCalledWith({
      query: 'Northstar', page: 1, pageSize: 10,
      companyStatuses: ['Active', 'Dissolved'], country: 'England',
    });
    const link = fixture.nativeElement.querySelector('.company-row a') as HTMLAnchorElement;
    const url = new URL(link.href);
    expect(url.searchParams.getAll('status')).toEqual(['Active', 'Dissolved']);
    expect(url.searchParams.has('city')).toBe(false);
    expect(url.searchParams.get('country')).toBe('England');

    choose('status', 'Active');
    const nextButton = Array.from(
      fixture.nativeElement.querySelectorAll('app-pagination button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Next'));
    nextButton?.click();
    expect(service.search).toHaveBeenLastCalledWith({
      query: 'Northstar', page: 2, pageSize: 10,
      companyStatuses: ['Active', 'Dissolved'], country: 'England',
    });
  });

  it('restores filters and page from the URL', async () => {
    await TestBed.inject(Router).navigate([], { queryParams: {
      q: 'Lloyds', page: 2, status: ['Active', 'Dissolved'], type: ['Ltd', 'Plc'],
      city: 'London', country: 'GreatBritain',
    } });
    fixture.detectChanges();

    expect(service.search).toHaveBeenLastCalledWith({
      query: 'Lloyds', page: 2, pageSize: 10,
      companyStatuses: ['Active', 'Dissolved'], companyTypes: ['Ltd', 'Plc'],
      country: 'GreatBritain',
    });
    expect(fixture.nativeElement.querySelector('#filter-city')).toBeNull();
    expect((fixture.nativeElement.querySelector('#filter-status') as HTMLElement).textContent).toContain('Active, Dissolved');
    expect((fixture.nativeElement.querySelector('#filter-type') as HTMLElement).textContent).toContain('Ltd, Plc');
  });

  it('waits for metadata and accepts new API values when restoring URL filters', async () => {
    const options = new Subject<CompanyFilterOptions>();
    service.optionsResponse = options;
    fixture.destroy();
    fixture = TestBed.createComponent(CompanySearch);
    fixture.detectChanges();
    await TestBed.inject(Router).navigate([], { queryParams: {
      q: 'Northstar', status: ['PendingReview', 'Active'], type: ['NewCompanyType', 'Ltd'], country: 'Wales',
    } });
    fixture.detectChanges();

    expect(service.search).not.toHaveBeenCalled();
    expect((fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
    options.next({ companyStatuses: ['PendingReview'], companyTypes: ['NewCompanyType'], countries: ['Wales'] });
    fixture.detectChanges();

    expect(service.search).toHaveBeenLastCalledWith({
      query: 'Northstar', page: 1, pageSize: 10,
      companyStatuses: ['PendingReview'], companyTypes: ['NewCompanyType'], country: 'Wales',
    });
    const status = picker('status');
    expect(Array.from(status.querySelectorAll('.filter-picker__list button'), (button) => button.textContent?.trim())).toEqual([
      'Any company status', 'Pending Review',
    ]);
  });

  it('allows unfiltered searches and retries when metadata fails', async () => {
    service.optionsResponse = throwError(() => new Error('Metadata unavailable'));
    fixture.destroy();
    fixture = TestBed.createComponent(CompanySearch);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Could not load search filters');
    expect(fixture.nativeElement.querySelector('#filter-status')).toBeNull();
    setQuery('Northstar');
    submit();
    expect(service.search).toHaveBeenLastCalledWith({ query: 'Northstar', page: 1, pageSize: 10 });
    await finishRequest();
    service.optionsResponse = of(service.options);
    (fixture.nativeElement.querySelector('.filter-load-error button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#filter-status')).not.toBeNull();
    expect((fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('restores an unfiltered search URL without filter metadata', async () => {
    service.optionsResponse = throwError(() => new Error('Metadata unavailable'));
    fixture.destroy();
    fixture = TestBed.createComponent(CompanySearch);
    fixture.detectChanges();

    await TestBed.inject(Router).navigate([], { queryParams: { q: 'Northstar', page: 2 } });
    fixture.detectChanges();
    expect(service.search).toHaveBeenLastCalledWith({ query: 'Northstar', page: 2, pageSize: 10 });
  });

  it('searches filter options without removing previously selected values', () => {
    setQuery('Northstar');
    choose('status', 'Active');
    choose('type', 'Ltd');

    picker('status').open = true;
    const statusSearch = fixture.nativeElement.querySelector('input[aria-label="Find company status"]') as HTMLInputElement;
    statusSearch.value = 'diss';
    statusSearch.dispatchEvent(new Event('input'));
    picker('type').open = true;
    const typeSearch = fixture.nativeElement.querySelector('input[aria-label="Find company type"]') as HTMLInputElement;
    typeSearch.value = 'partnership';
    typeSearch.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(Array.from(picker('status').querySelectorAll('.filter-picker__list button'), (button) => button.textContent?.trim()))
      .toEqual(['Any company status', 'Active', 'Dissolved']);
    expect(picker('type').textContent).toContain('Limited Partnership');
    choose('status', 'Dissolved');
    choose('type', 'Limited Partnership');
    expect((fixture.nativeElement.querySelector('#filter-status') as HTMLElement).textContent).toContain('Active, Dissolved');
    expect((fixture.nativeElement.querySelector('#filter-type') as HTMLElement).textContent).toContain('Ltd, Limited Partnership');
    submit();
    expect(service.search).toHaveBeenLastCalledWith({
      query: 'Northstar', page: 1, pageSize: 10,
      companyStatuses: ['Active', 'Dissolved'], companyTypes: ['Ltd', 'LimitedPartnership'],
    });
  });

  it('keeps newly restored selections visible under an existing option search', async () => {
    const input = fixture.nativeElement.querySelector('input[aria-label="Find company status"]') as HTMLInputElement;
    input.value = 'no match';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(picker('status').querySelectorAll('.filter-picker__list button')).toHaveLength(1);

    await TestBed.inject(Router).navigate([], { queryParams: { q: 'Tesco', status: 'Active' } });
    fixture.detectChanges();

    expect(Array.from(picker('status').querySelectorAll('.filter-picker__list button'),
      (button) => button.textContent?.trim())).toEqual(['Any company status', 'Active']);
  });

  it('removing the final selection restores Any independently for each picker', () => {
    setQuery('Tesco');
    choose('status', 'Active');
    choose('type', 'Ltd');
    choose('status', 'Active');
    submit();
    expect(service.search).toHaveBeenLastCalledWith({ query: 'Tesco', page: 1, pageSize: 10, companyTypes: ['Ltd'] });
    choose('type', 'Ltd');
    submit();
    expect(service.search).toHaveBeenLastCalledWith({ query: 'Tesco', page: 1, pageSize: 10 });
  });

  it('restores only the latest filtered URL when metadata arrives', async () => {
    const options = new Subject<CompanyFilterOptions>();
    service.optionsResponse = options;
    fixture.destroy();
    fixture = TestBed.createComponent(CompanySearch);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    await router.navigate([], { queryParams: { q: 'Old', status: 'Active' } });
    await router.navigate([], { queryParams: { q: 'Latest', type: 'Plc' } });
    expect(service.search).not.toHaveBeenCalled();
    options.next(service.options);
    expect(service.search).toHaveBeenCalledExactlyOnceWith({ query: 'Latest', page: 1, pageSize: 10, companyTypes: ['Plc'] });
  });

  it('does not resurrect a filtered deep link after a new unfiltered submission', async () => {
    const options = new Subject<CompanyFilterOptions>();
    service.optionsResponse = options;
    fixture.destroy();
    fixture = TestBed.createComponent(CompanySearch);
    fixture.detectChanges();
    await TestBed.inject(Router).navigate([], { queryParams: { q: 'Old', status: 'Active' } });
    setQuery('Latest');
    submit();
    await finishRequest();
    options.next(service.options);
    expect(service.search).toHaveBeenCalledExactlyOnceWith({ query: 'Latest', page: 1, pageSize: 10 });
  });

  it('closes a picker when clicking elsewhere or pressing Escape', () => {
    const status = picker('status');
    status.open = true;
    (fixture.nativeElement.querySelector('#filter-country') as HTMLSelectElement).click();
    expect(status.open).toBe(false);

    const type = picker('type');
    type.open = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(type.open).toBe(false);
  });

  it('selecting Any clears a specific status or type without sending an empty enum', () => {
    setQuery('Northstar');
    choose('status', 'Active');
    choose('type', 'Ltd');
    choose('status', 'Any company status');
    choose('type', 'Any company type');

    expect((fixture.nativeElement.querySelector('#filter-status') as HTMLElement).textContent).toContain('Any company status');
    expect((fixture.nativeElement.querySelector('#filter-type') as HTMLElement).textContent).toContain('Any company type');
    submit();
    expect(service.search).toHaveBeenLastCalledWith({ query: 'Northstar', page: 1, pageSize: 10 });
  });

  it('clears all filter controls without submitting or clearing the query', () => {
    setQuery('Northstar');
    choose('status', 'Active');
    choose('type', 'Ltd');
    const country = fixture.nativeElement.querySelector('#filter-country') as HTMLSelectElement;
    country.value = 'England';
    country.dispatchEvent(new Event('change'));
    picker('status').open = true;
    const statusSearch = fixture.nativeElement.querySelector('input[aria-label="Find company status"]') as HTMLInputElement;
    statusSearch.value = 'active';
    statusSearch.dispatchEvent(new Event('input'));
    const typeSearch = fixture.nativeElement.querySelector('input[aria-label="Find company type"]') as HTMLInputElement;
    typeSearch.value = 'ltd';
    typeSearch.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.filters__clear') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('#company-query') as HTMLInputElement).value).toBe('Northstar');
    expect((fixture.nativeElement.querySelector('#filter-status') as HTMLElement).textContent).toContain('Any company status');
    expect((fixture.nativeElement.querySelector('#filter-type') as HTMLElement).textContent).toContain('Any company type');
    expect(country.value).toBe('');
    expect(statusSearch.value).toBe('');
    expect(typeSearch.value).toBe('');
    expect(service.search).not.toHaveBeenCalled();
    submit();
    expect(service.search).toHaveBeenLastCalledWith({ query: 'Northstar', page: 1, pageSize: 10 });
  });

  it.each(['0', '-1', '1.5', 'abc'])('normalizes invalid URL page %s', async (page) => {
    await TestBed.inject(Router).navigate([], { queryParams: { q: ' Tesco ', page } });
    expect(service.search).toHaveBeenCalledExactlyOnceWith({ query: 'Tesco', page: 1, pageSize: 10 });
  });

  it('recovers after an error without recreating the component', async () => {
    service.shouldFail = true;
    setQuery('Tesco');
    submit();
    service.shouldFail = false;
    submit();
    await finishRequest();
    expect(fixture.nativeElement.textContent).toContain('Tesco PLC');
    expect(fixture.nativeElement.textContent).not.toContain('We could not complete the search');
  });

  it('cancels an older search and ignores its late response', async () => {
    const older = new Subject<CompanySearchPage>();
    const latest = new Subject<CompanySearchPage>();
    service.search.mockReturnValueOnce(older).mockReturnValueOnce(latest);
    const router = TestBed.inject(Router);
    await router.navigate([], { queryParams: { q: 'Older' } });
    await router.navigate([], { queryParams: { q: 'Latest' } });
    expect(older.observed).toBe(false);
    latest.next(service.response);
    older.next({ ...service.response, items: [{ name: 'Stale result', registrationNumber: '12345678' }] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Tesco PLC');
    expect(fixture.nativeElement.textContent).not.toContain('Stale result');
    fixture.destroy();
    expect(latest.observed).toBe(false);
  });

  it('clears results and cancels the request when navigation removes the query', async () => {
    const pending = new Subject<CompanySearchPage>();
    service.search.mockReturnValue(pending);
    const router = TestBed.inject(Router);
    await router.navigate([], { queryParams: { q: 'Tesco' } });
    pending.next(service.response);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Tesco PLC');

    await router.navigate([], { queryParams: {} });
    fixture.detectChanges();
    expect(pending.observed).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Tesco PLC');
    expect(fixture.nativeElement.textContent).not.toContain('Searching company records');
    expect((fixture.nativeElement.querySelector('input') as HTMLInputElement).value).toBe('');

    await router.navigate([], { queryParams: { q: 'Tesco' } });
    expect(service.search).toHaveBeenCalledTimes(2);
  });
});
