import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { delay, Observable, of, Subject, throwError } from 'rxjs';
import { SearchLogPage } from './search-log.model';
import { SearchLogService } from './search-log.service';
import { SearchLogs } from './search-logs';

class SearchLogServiceStub {
  shouldFail = false;
  readonly getPage = vi.fn(
    (page: number, pageSize: number, query = ''): Observable<SearchLogPage> => {
      if (this.shouldFail) {
        return throwError(() => new Error('Database unavailable'));
      }

      return of({
        items: [
          {
            searchLogId: 12,
            userInput: 'Lloyds',
            companyName: 'LLOYDS BANK PLC',
            searchedAt: '2026-09-29T10:30:00+00:00',
            resultCount: 100,
            httpStatus: 200,
          },
        ],
        totalResults: 1,
        page,
        pageSize,
        query,
      }).pipe(delay(10));
    },
  );
}

describe('SearchLogs', () => {
  let fixture: ComponentFixture<SearchLogs>;
  let service: SearchLogServiceStub;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [SearchLogs],
      providers: [provideRouter([]), { provide: SearchLogService, useClass: SearchLogServiceStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(SearchLogs);
    service = TestBed.inject(SearchLogService) as unknown as SearchLogServiceStub;
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  function setQuery(value: string): void {
    const input = fixture.nativeElement.querySelector('#log-query') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function page(overrides: Partial<SearchLogPage> = {}): SearchLogPage {
    return { items: [], totalResults: 0, page: 1, pageSize: 20, ...overrides };
  }

  it('renders the most useful recorded search fields', async () => {
    await vi.advanceTimersByTimeAsync(10);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(service.getPage).toHaveBeenCalledWith(1, 20, '');
    expect(text).toContain('Lloyds');
    expect(text).toContain('LLOYDS BANK PLC');
    expect(text).toContain('Search input');
    expect(text).toContain('100');
    expect(text).toContain('Successful');
    expect(text).toContain('200');
  });

  it('shows a recoverable error state', () => {
    service.shouldFail = true;
    (fixture.componentInstance as unknown as { retry(): void }).retry();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('We could not load the activity log');
    expect(fixture.nativeElement.textContent).toContain('Try again');
  });

  it.each(['0', '-1', '1.5', 'invalid'])('normalizes invalid URL page %s', async (value) => {
    await TestBed.inject(Router).navigate([], { queryParams: { q: ' Lloyds ', page: value } });
    expect(service.getPage).toHaveBeenLastCalledWith(1, 20, 'Lloyds');
  });

  it('keeps the submitted filter on pagination and clears it through the URL', async () => {
    service.getPage.mockImplementation((requestedPage, pageSize, query) => of(page({
      page: requestedPage, pageSize, query, totalResults: 41,
      items: [{ searchLogId: 1, userInput: 'MATCH', searchedAt: '2026-01-01T00:00:00Z', resultCount: 1, httpStatus: 200 }],
    })));
    const router = TestBed.inject(Router);
    await router.navigate([], { queryParams: { q: 'Lloyds', page: 1 } });
    fixture.detectChanges();
    setQuery('unsent draft');
    const next = Array.from(fixture.nativeElement.querySelectorAll('app-pagination button') as NodeListOf<HTMLButtonElement>)
      .find((button) => button.textContent?.includes('Next'))!;
    next.click();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(service.getPage).toHaveBeenLastCalledWith(2, 20, 'Lloyds');
    (fixture.nativeElement.querySelector('.button--secondary') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(service.getPage).toHaveBeenLastCalledWith(1, 20, '');
    expect(router.parseUrl(router.url).queryParams['q']).toBeUndefined();
  });

  it.each(['', 'missing'])('renders the appropriate empty state for filter %j', async (query) => {
    service.getPage.mockReturnValue(of(page()));
    await TestBed.inject(Router).navigate([], { queryParams: { q: query, page: 1 } });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(query ? 'No matching activity' : 'No searches recorded yet');
  });

  it('does not submit an overlong filter', async () => {
    await vi.advanceTimersByTimeAsync(10);
    service.getPage.mockClear();
    setQuery('a'.repeat(101));
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    expect(service.getPage).not.toHaveBeenCalled();
  });

  it('recovers through the retry button', async () => {
    service.shouldFail = true;
    await TestBed.inject(Router).navigate([], { queryParams: { q: 'failed' } });
    fixture.detectChanges();
    service.shouldFail = false;
    (fixture.nativeElement.querySelector('.state-message--error button') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(10);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('LLOYDS BANK PLC');
  });

  it('cancels older requests and unsubscribes on destruction', async () => {
    const older = new Subject<SearchLogPage>();
    const latest = new Subject<SearchLogPage>();
    service.getPage.mockReturnValueOnce(older).mockReturnValueOnce(latest);
    const router = TestBed.inject(Router);
    await router.navigate([], { queryParams: { q: 'older' } });
    await router.navigate([], { queryParams: { q: 'latest' } });
    fixture.detectChanges();
    expect(older.observed).toBe(false);
    expect(fixture.nativeElement.querySelector('.logs-panel').getAttribute('aria-busy')).toBe('true');
    latest.next(page());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.logs-panel').getAttribute('aria-busy')).toBe('false');
    fixture.destroy();
    expect(latest.observed).toBe(false);
  });

  it('keeps a malformed timestamp from breaking the activity list', async () => {
    service.getPage.mockReturnValue(of(page({ totalResults: 1, items: [{
      searchLogId: 1, userInput: 'READABLE', searchedAt: 'invalid', resultCount: 0, httpStatus: 404,
    }] })));
    await TestBed.inject(Router).navigate([], { queryParams: { page: 2 } });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('READABLE');
    expect(fixture.nativeElement.textContent).toContain('Not available');
    expect(fixture.nativeElement.textContent).toContain('Not found');
  });
});
