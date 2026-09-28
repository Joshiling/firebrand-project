import { firstValueFrom } from 'rxjs';
import { MockCompanySearchService } from './mock-company-search.service';

describe('MockCompanySearchService', () => {
  let service: MockCompanySearchService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new MockCompanySearchService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function completeSearch(query: string, page = 1, pageSize = 10) {
    const resultPromise = firstValueFrom(service.search({ query, page, pageSize }));
    await vi.advanceTimersByTimeAsync(300);
    return resultPromise;
  }

  it('finds companies by a case-insensitive partial name', async () => {
    const result = await completeSearch('tEsCo');

    expect(result.totalResults).toBe(1);
    expect(result.items[0].name).toBe('TESCO PLC');
  });

  it('finds a registration number exactly and preserves leading zeros', async () => {
    const result = await completeSearch('00445790');

    expect(result.items[0].registrationNumber).toBe('00445790');
  });

  it('supports registration numbers containing letters', async () => {
    const result = await completeSearch('sc123456');

    expect(result.items[0].name).toBe('RIVER & FIELD TRADING LTD');
  });

  it('maps the API-shaped Lloyds profile without losing leading zeros', async () => {
    const result = await completeSearch('00002065');

    expect(result.items[0]).toMatchObject({
      name: 'LLOYDS BANK PLC',
      registrationNumber: '00002065',
      status: 'active',
      type: 'plc',
    });
  });

  it('filters before returning a requested page', async () => {
    const result = await completeSearch('northstar', 3, 10);

    expect(result.totalResults).toBe(23);
    expect(result.items).toHaveLength(3);
    expect(result.page).toBe(3);
  });

  it('returns an empty page when no companies match', async () => {
    const result = await completeSearch('no matching company');

    expect(result.totalResults).toBe(0);
    expect(result.items).toEqual([]);
  });
});
