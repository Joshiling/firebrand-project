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
});
