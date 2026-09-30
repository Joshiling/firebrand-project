import { firstValueFrom } from 'rxjs';
import { CompanySearchRequest } from './company.model';
import { MockCompanySearchService } from './mock-company-search.service';
import { MOCK_COMPANY_PROFILES } from './mock-companies';

describe('MockCompanySearchService', () => {
  let service: MockCompanySearchService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new MockCompanySearchService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function completeSearch(query: string, page = 1, pageSize = 10, filters: Partial<CompanySearchRequest> = {}) {
    const resultPromise = firstValueFrom(service.search({ query, page, pageSize, ...filters }));
    await vi.advanceTimersByTimeAsync(300);
    return resultPromise;
  }

  it('applies status filters before counting and slicing a page', async () => {
    const result = await completeSearch('northstar', 2, 2, { companyStatuses: ['Dissolved'] });

    expect(result.totalResults).toBe(4);
    expect(result.items.map((company) => company.registrationNumber)).toEqual(['01000012', '01000018']);
    expect(result.items.every((company) => company.status === 'dissolved')).toBe(true);
  });

  it.each([
    { companyStatuses: ['Dissolved'] },
    { companyTypes: ['Ltd'] },
    { country: 'England' },
  ])('excludes an exact number match that does not satisfy %j', async (filters) => {
    const result = await completeSearch('00002065', 1, 10, filters);

    expect(result.totalResults).toBe(0);
    expect(result.items).toEqual([]);
  });

  it('uses OR within a selection and AND between filter dimensions', async () => {
    const result = await completeSearch('northstar', 1, 30, {
      companyStatuses: ['Active', 'Dissolved'], companyTypes: ['Plc', 'Ltd'],
    });
    expect(result.totalResults).toBe(23);

    const excluded = await completeSearch('northstar', 1, 30, {
      companyStatuses: ['Active'], companyTypes: ['Plc'],
    });
    expect(excluded.totalResults).toBe(0);
  });

  it('does not infer missing filter fields on sparse profiles', async () => {
    const result = await completeSearch('beacon', 1, 10, { companyStatuses: ['Active'] });
    expect(result.items).toEqual([]);
  });

  it.each(['lloyds', '00002065'])('matches all explicit dimensions for %s', async (query) => {
    const address = MOCK_COMPANY_PROFILES.find((profile) => profile.company_number === '00002065')!.registered_office_address!;
    const originalCountry = address.country;
    try {
      address.country = 'England';
      const result = await completeSearch(query, 1, 10, {
        companyStatuses: ['Active'], companyTypes: ['Plc'], country: 'England',
      });
      expect(result.totalResults).toBe(1);
      expect(result.items[0].registrationNumber).toBe('00002065');
      const excluded = await completeSearch(query, 1, 10, { country: 'Scotland' });
      expect(excluded.items).toEqual([]);
    } finally {
      if (originalCountry === undefined) {
        delete address.country;
      } else {
        address.country = originalCountry;
      }
    }
  });

  async function completeDetails(registrationNumber: string) {
    const resultPromise = firstValueFrom(service.getDetails(registrationNumber));
    await vi.advanceTimersByTimeAsync(250);
    return resultPromise;
  }

  async function completeHistory(registrationNumber: string) {
    const resultPromise = firstValueFrom(service.getHistory(registrationNumber));
    await vi.advanceTimersByTimeAsync(200);
    return resultPromise;
  }

  it('returns the full supplied profile without losing leading zeros', async () => {
    const result = await completeDetails('00002065');

    expect(result?.company_number).toBe('00002065');
    expect(result?.accounts?.last_accounts?.type).toBe('group');
    expect(result?.previous_company_names).toHaveLength(5);
    expect(result?.sic_codes).toEqual(['64191']);
    expect(result?.version_count).toBe(3);
  });

  it('returns newest-first Lloyds version history with changed names and addresses', async () => {
    const result = await completeHistory('00002065');

    expect(result.map((entry) => entry.versionNumber)).toEqual([3, 2, 1]);
    expect(result[0].address).toBe('25 Gresham Street, London, EC2V 7HN');
    expect(result[2].companyName).toBe('LLOYDS BANK LIMITED');
  });

  it('returns no mock history for a company without recorded versions', async () => {
    await expect(completeHistory('00445790')).resolves.toEqual([]);
  });

  it('returns sparse and prefixed profiles without inventing detail data', async () => {
    const sparseResult = await completeDetails('09876543');
    const prefixedResult = await completeDetails('sc123456');

    expect(sparseResult).toEqual({
      company_name: 'BEACON COMMUNITY INTEREST COMPANY',
      company_number: '09876543',
    });
    expect(prefixedResult?.company_number).toBe('SC123456');
  });

  it('returns null when the requested profile does not exist', async () => {
    await expect(completeDetails('11111111')).resolves.toBeNull();
  });

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
