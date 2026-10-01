import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SearchLogService } from './search-log.service';

describe('SearchLogService', () => {
  let service: SearchLogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SearchLogService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(SearchLogService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests a page of search logs from the backend', async () => {
    const resultPromise = firstValueFrom(service.getPage(2, 20));
    const request = http.expectOne('/search_logs?page=2&pageSize=20');

    expect(request.request.method).toBe('GET');
    request.flush({
      items: [
        {
          searchLogId: 8,
          userInput: 'Lloyds',
          companyName: 'LLOYDS BANK PLC',
          searchedAt: '2026-09-29T10:30:00+00:00',
          resultCount: 100,
          httpStatus: 200,
        },
      ],
      totalResults: 21,
      page: 2,
      pageSize: 20,
    });

    await expect(resultPromise).resolves.toMatchObject({
      totalResults: 21,
      page: 2,
      items: [{ userInput: 'Lloyds', httpStatus: 200 }],
    });
  });

  it('passes a database search term to the backend', async () => {
    const resultPromise = firstValueFrom(service.getPage(1, 20, 'Lloyds Bank'));
    const request = http.expectOne('/search_logs?page=1&pageSize=20&query=Lloyds%20Bank');
    request.flush({ items: [], totalResults: 0, page: 1, pageSize: 20, query: 'Lloyds Bank' });

    await expect(resultPromise).resolves.toMatchObject({ query: 'Lloyds Bank' });
  });

  it('encodes literal punctuation and cancels on unsubscription', () => {
    // These characters must remain one literal query parameter, not URL syntax.
    const query = 'A & B + 100%_';
    const subscription = service.getPage(1, 20, query).subscribe();
    const request = http.expectOne((candidate) => candidate.url === '/search_logs');
    const url = new URL(request.request.urlWithParams, 'http://localhost');
    expect([...url.searchParams.entries()]).toEqual([['page', '1'], ['pageSize', '20'], ['query', query]]);
    subscription.unsubscribe();
    expect(request.cancelled).toBe(true);
  });

  it('propagates service failures instead of displaying an empty log', async () => {
    const result = firstValueFrom(service.getPage(1, 20));
    const rejected = expect(result).rejects.toMatchObject({ status: 503 });
    http.expectOne('/search_logs?page=1&pageSize=20').flush(null, { status: 503, statusText: 'Unavailable' });
    await rejected;
  });
});
