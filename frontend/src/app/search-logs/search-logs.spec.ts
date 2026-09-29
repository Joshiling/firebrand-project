import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { delay, Observable, of, throwError } from 'rxjs';
import { SearchLogPage } from './search-log.model';
import { SearchLogService } from './search-log.service';
import { SearchLogs } from './search-logs';

class SearchLogServiceStub {
  shouldFail = false;
  readonly getPage = vi.fn((page: number, pageSize: number): Observable<SearchLogPage> => {
    if (this.shouldFail) {
      return throwError(() => new Error('Database unavailable'));
    }

    return of({
      items: [
        {
          searchLogId: 12,
          userInput: 'Lloyds',
          searchedAt: '2026-09-29T10:30:00+00:00',
          resultCount: 100,
          httpStatus: 200,
        },
      ],
      totalResults: 1,
      page,
      pageSize,
    }).pipe(delay(10));
  });
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

  it('renders the most useful recorded search fields', async () => {
    await vi.advanceTimersByTimeAsync(10);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(service.getPage).toHaveBeenCalledWith(1, 20);
    expect(text).toContain('Lloyds');
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
});
