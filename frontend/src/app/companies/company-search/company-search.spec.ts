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

  override getDetails() {
    return of(null);
  }

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

  function setQuery(value: string): void {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submit(): void {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

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
    const status = fixture.nativeElement.querySelector('#filter-status') as HTMLSelectElement;
    status.options[1].selected = true;
    status.options[2].selected = true;
    status.dispatchEvent(new Event('change'));
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

    status.options[1].selected = false;
    status.dispatchEvent(new Event('change'));
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
    const status = fixture.nativeElement.querySelector('#filter-status') as HTMLSelectElement;
    expect(Array.from(status.selectedOptions, (option) => option.textContent?.trim())).toEqual([
      'Active', 'Dissolved',
    ]);
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
    expect((fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    options.next({ companyStatuses: ['PendingReview'], companyTypes: ['NewCompanyType'], countries: ['Wales'] });
    fixture.detectChanges();

    expect(service.search).toHaveBeenLastCalledWith({
      query: 'Northstar', page: 1, pageSize: 10,
      companyStatuses: ['PendingReview'], companyTypes: ['NewCompanyType'], country: 'Wales',
    });
    const status = fixture.nativeElement.querySelector('#filter-status') as HTMLSelectElement;
    expect(Array.from(status.options, (option) => option.textContent?.trim())).toEqual([
      'Any company status', 'Pending Review',
    ]);
  });

  it('allows retrying failed metadata without sending a search with invalid filters', () => {
    service.optionsResponse = throwError(() => new Error('Metadata unavailable'));
    fixture.destroy();
    fixture = TestBed.createComponent(CompanySearch);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Could not load search filters');
    expect((fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    service.optionsResponse = of(service.options);
    (fixture.nativeElement.querySelector('.filter-load-error button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#filter-status')).not.toBeNull();
    expect((fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('searches filter options without removing previously selected values', () => {
    setQuery('Northstar');
    const status = fixture.nativeElement.querySelector('#filter-status') as HTMLSelectElement;
    status.options[1].selected = true;
    status.dispatchEvent(new Event('change'));
    const type = fixture.nativeElement.querySelector('#filter-type') as HTMLSelectElement;
    type.options[2].selected = true;
    type.dispatchEvent(new Event('change'));

    const statusSearch = fixture.nativeElement.querySelector('input[aria-label="Find company status"]') as HTMLInputElement;
    statusSearch.value = 'diss';
    statusSearch.dispatchEvent(new Event('input'));
    const typeSearch = fixture.nativeElement.querySelector('input[aria-label="Find company type"]') as HTMLInputElement;
    typeSearch.value = 'partnership';
    typeSearch.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(Array.from(status.options, (option) => option.textContent?.trim())).toEqual(['Any company status', 'Active', 'Dissolved']);
    expect(status.selectedOptions.length).toBe(1);
    expect(Array.from(type.options, (option) => option.textContent?.trim())).toContain('Limited Partnership');
    expect(type.selectedOptions.length).toBe(1);
    status.options[2].selected = true;
    status.dispatchEvent(new Event('change'));
    const partnership = Array.from(type.options).find((option) => option.textContent?.trim() === 'Limited Partnership');
    partnership!.selected = true;
    type.dispatchEvent(new Event('change'));
    submit();
    expect(service.search).toHaveBeenLastCalledWith({
      query: 'Northstar', page: 1, pageSize: 10,
      companyStatuses: ['Active', 'Dissolved'], companyTypes: ['Ltd', 'LimitedPartnership'],
    });
  });

  it('selecting Any clears a specific status or type without sending an empty enum', () => {
    setQuery('Northstar');
    const status = fixture.nativeElement.querySelector('#filter-status') as HTMLSelectElement;
    const type = fixture.nativeElement.querySelector('#filter-type') as HTMLSelectElement;
    expect(status.selectedOptions[0].textContent).toBe('Any company status');
    expect(type.selectedOptions[0].textContent).toBe('Any company type');

    status.options[0].selected = false;
    status.options[1].selected = true;
    status.dispatchEvent(new Event('change'));
    type.options[0].selected = false;
    type.options[2].selected = true;
    type.dispatchEvent(new Event('change'));
    status.options[0].selected = true;
    status.dispatchEvent(new Event('change'));
    type.options[0].selected = true;
    type.dispatchEvent(new Event('change'));

    expect(Array.from(status.selectedOptions, (option) => option.textContent)).toEqual(['Any company status']);
    expect(Array.from(type.selectedOptions, (option) => option.textContent)).toEqual(['Any company type']);
    submit();
    expect(service.search).toHaveBeenLastCalledWith({ query: 'Northstar', page: 1, pageSize: 10 });
  });

  it('clears all filter controls without submitting or clearing the query', () => {
    setQuery('Northstar');
    const status = fixture.nativeElement.querySelector('#filter-status') as HTMLSelectElement;
    const type = fixture.nativeElement.querySelector('#filter-type') as HTMLSelectElement;
    status.options[0].selected = false;
    status.options[1].selected = true;
    status.dispatchEvent(new Event('change'));
    type.options[0].selected = false;
    type.options[2].selected = true;
    type.dispatchEvent(new Event('change'));
    const country = fixture.nativeElement.querySelector('#filter-country') as HTMLSelectElement;
    country.value = 'England';
    country.dispatchEvent(new Event('change'));
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
    expect(Array.from(status.selectedOptions, (option) => option.textContent)).toEqual(['Any company status']);
    expect(Array.from(type.selectedOptions, (option) => option.textContent)).toEqual(['Any company type']);
    expect(country.value).toBe('');
    expect(statusSearch.value).toBe('');
    expect(typeSearch.value).toBe('');
    expect(service.search).not.toHaveBeenCalled();
    submit();
    expect(service.search).toHaveBeenLastCalledWith({ query: 'Northstar', page: 1, pageSize: 10 });
  });

});
