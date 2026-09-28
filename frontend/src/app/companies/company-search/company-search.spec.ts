import { ComponentFixture, TestBed } from '@angular/core/testing';
import { delay, Observable, of, throwError } from 'rxjs';
import { CompanySearchPage, CompanySearchRequest } from '../company.model';
import { CompanySearchService } from '../company-search.service';
import { CompanySearch } from './company-search';

class SearchServiceStub extends CompanySearchService {
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
      providers: [{ provide: CompanySearchService, useClass: SearchServiceStub }],
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
});
