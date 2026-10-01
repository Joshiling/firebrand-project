import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable } from 'rxjs';
import { HttpCompanySearchService } from './http-company-search.service';

describe('HttpCompanySearchService', () => {
  let service: HttpCompanySearchService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HttpCompanySearchService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(HttpCompanySearchService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads supported filter values from the API', async () => {
    const resultPromise = firstValueFrom(service.getFilterOptions());
    const request = http.expectOne('/search/filters');
    expect(request.request.method).toBe('GET');
    const options = { companyStatuses: ['Active'], companyTypes: ['Ltd'], countries: ['Wales'] };
    request.flush(options);
    await expect(resultPromise).resolves.toEqual(options);
  });

  it('searches by company name and maps a page of backend results', async () => {
    const resultPromise = firstValueFrom(
      service.search({ query: ' Lloyds ', page: 2, pageSize: 1 }),
    );
    const request = http.expectOne('/name?name=Lloyds');

    expect(request.request.method).toBe('GET');
    request.flush([
      { name: 'LLOYDS BANK PLC', registryId: '00002065', address: 'London' },
      {
        name: 'LLOYDS DEVELOPMENT CAPITAL',
        registryId: '02087303',
        address: 'Bristol',
        companyStatus: 'active',
        companyType: 'ltd',
      },
    ]);

    await expect(resultPromise).resolves.toEqual({
      items: [
        {
          name: 'LLOYDS DEVELOPMENT CAPITAL',
          registrationNumber: '02087303',
          status: 'active',
          type: 'ltd',
          registeredAddress: { addressLine1: 'Bristol' },
        },
      ],
      totalResults: 2,
      page: 2,
      pageSize: 1,
    });
  });

  it('uses the registration-number route for prefixed company numbers', async () => {
    const resultPromise = firstValueFrom(
      service.search({ query: 'SC123456', page: 1, pageSize: 10 }),
    );
    const request = http.expectOne('/registry_id?registry_id=SC123456');
    request.flush([]);

    await expect(resultPromise).resolves.toMatchObject({ totalResults: 0 });
  });

  it('sends repeated enum filters and the country filter to the backend', async () => {
    const resultPromise = firstValueFrom(service.search({
      query: ' Lloyds ', page: 1, pageSize: 10,
      companyStatuses: ['Active', 'Dissolved'], companyTypes: ['Ltd', 'Plc'],
      country: 'GreatBritain',
    }));
    const request = http.expectOne((candidate) => candidate.url === '/name');

    expect(request.request.params.getAll('company_status')).toEqual(['Active', 'Dissolved']);
    expect(request.request.params.getAll('company_type')).toEqual(['Ltd', 'Plc']);
    expect(request.request.params.has('city')).toBe(false);
    expect(request.request.params.get('country')).toBe('GreatBritain');
    request.flush([]);
    await expect(resultPromise).resolves.toMatchObject({ totalResults: 0 });
  });

  it('maps backend details into the Companies House profile shape used by the view', async () => {
    const resultPromise = firstValueFrom(service.getDetails('00002065'));
    const request = http.expectOne('/registry_id/00002065');
    // Top-level fields are camelCase, but reused nested backend DTOs are snake_case.
    request.flush({
      name: 'LLOYDS BANK PLC',
      registryId: '00002065',
      address: '25 Gresham Street, London, EC2V 7HN',
      companyStatus: 'active',
      companyType: 'plc',
      accounts: {
        accounting_reference_date: { day: '31', month: '12' },
        next_due: '2027-06-30',
        overdue: false,
      },
      canFile: true,
      confirmationStatement: {
        next_due: '2027-05-20',
        overdue: false,
      },
      dateOfCreation: '1865-04-20',
      etag: 'profile-etag',
      hasCharges: false,
      hasInsolvencyHistory: false,
      hasSuperSecurePscs: false,
      jurisdiction: 'england-wales',
      lastFullMembersListDate: '2016-05-09',
      links: { self: '/company/00002065' },
      previousCompanyNames: [
        {
          name: 'LLOYDS TSB BANK PLC',
          effective_from: '1999-06-28',
          ceased_on: '2013-09-23',
        },
      ],
      registeredOfficeAddress: {
        address_line_1: '25 Gresham Street',
        country: 'United Kingdom',
        locality: 'London',
        postal_code: 'EC2V 7HN',
        region: 'Greater London',
      },
      registeredOfficeIsInDispute: false,
      sicCodes: ['64191'],
      undeliverableRegisteredOfficeAddress: false,
      version_count: 3,
    });

    await expect(resultPromise).resolves.toMatchObject({
      company_name: 'LLOYDS BANK PLC',
      company_number: '00002065',
      company_status: 'active',
      type: 'plc',
      accounts: {
        accounting_reference_date: { day: '31', month: '12' },
        next_due: '2027-06-30',
        overdue: false,
      },
      can_file: true,
      confirmation_statement: { next_due: '2027-05-20', overdue: false },
      date_of_creation: '1865-04-20',
      etag: 'profile-etag',
      has_charges: false,
      has_insolvency_history: false,
      has_super_secure_pscs: false,
      jurisdiction: 'england-wales',
      last_full_members_list_date: '2016-05-09',
      links: { self: '/company/00002065' },
      previous_company_names: [
        {
          name: 'LLOYDS TSB BANK PLC',
          effective_from: '1999-06-28',
          ceased_on: '2013-09-23',
        },
      ],
      registered_office_address: {
        address_line_1: '25 Gresham Street',
        country: 'United Kingdom',
        locality: 'London',
        postal_code: 'EC2V 7HN',
        region: 'Greater London',
      },
      registered_office_is_in_dispute: false,
      sic_codes: ['64191'],
      undeliverable_registered_office_address: false,
      version_count: 3,
    });
  });

  it('loads and maps company history from the snake-case backend contract', async () => {
    const resultPromise = firstValueFrom(service.getHistory('00002065'));
    const request = http.expectOne('/registry_id/00002065/history');

    expect(request.request.method).toBe('GET');
    request.flush([
      {
        version_number: 2,
        recorded_at: '2026-09-29T10:30:00Z',
        company_number: '00002065',
        company_name: 'LLOYDS BANK PLC',
        company_status: 'active',
        incorporation_date: '1865-04-20',
        address: '25 Gresham Street, London, EC2V 7HN',
        external_registration_number: 'EXT-1',
      },
    ]);

    await expect(resultPromise).resolves.toEqual([
      {
        versionNumber: 2,
        recordedAt: '2026-09-29T10:30:00Z',
        companyNumber: '00002065',
        companyName: 'LLOYDS BANK PLC',
        companyStatus: 'active',
        incorporationDate: '1865-04-20',
        address: '25 Gresham Street, London, EC2V 7HN',
        externalRegistrationNumber: 'EXT-1',
      },
    ]);
  });

  it('returns an empty history when the backend has no recorded company', async () => {
    const resultPromise = firstValueFrom(service.getHistory('99999999'));
    const request = http.expectOne('/registry_id/99999999/history');
    request.flush(null, { status: 404, statusText: 'Not Found' });

    await expect(resultPromise).resolves.toEqual([]);
  });

  it('returns null when the backend reports that details were not found', async () => {
    const resultPromise = firstValueFrom(service.getDetails('99999999'));
    const request = http.expectOne('/registry_id/99999999');
    request.flush(null, { status: 404, statusText: 'Not Found' });

    await expect(resultPromise).resolves.toBeNull();
  });

  // Client, rate-limit, and server errors must not be mistaken for "not found".
  it.each([400, 429, 500, 502, 503])('propagates HTTP %i for search and details', async (status) => {
    const operations: Observable<unknown>[] = [service.search({ query: 'Tesco', page: 1, pageSize: 10 }), service.getDetails('00445790')];
    for (const operation of operations) {
      const result = firstValueFrom(operation);
      const rejected = expect(result).rejects.toMatchObject({ status });
      http.expectOne(() => true).flush({ detail: 'Unavailable' }, { status, statusText: 'Failure' });
      await rejected;
    }
  });

  it('propagates a network failure and allows the next request to succeed', async () => {
    const failed = firstValueFrom(service.getDetails('00445790'));
    const rejected = expect(failed).rejects.toMatchObject({ status: 0 });
    http.expectOne('/registry_id/00445790').error(new ProgressEvent('error'));
    await rejected;
    const recovered = firstValueFrom(service.getDetails('00445790'));
    http.expectOne('/registry_id/00445790').flush({ name: 'TESCO', registryId: '00445790' });
    await expect(recovered).resolves.toMatchObject({ company_name: 'TESCO', company_number: '00445790' });
  });

  // Ampersands, slashes, apostrophes, plus signs, and Unicode stay in one value.
  it.each(['A & B + C', "O'Brien / Trading", 'Caf\u00e9'])('encodes query %s as one parameter', async (query) => {
    const result = firstValueFrom(service.search({ query: ` ${query} `, page: 1, pageSize: 10 }));
    const request = http.expectOne((candidate) => candidate.url === '/name');
    const url = new URL(request.request.urlWithParams, 'http://localhost');
    expect([...url.searchParams.entries()]).toEqual([['name', query]]);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush([]);
    await expect(result).resolves.toEqual({ items: [], totalResults: 0, page: 1, pageSize: 10 });
  });

  it('encodes a details identifier as one path segment', async () => {
    const result = firstValueFrom(service.getDetails(' SC12/34?56 '));
    http.expectOne('/registry_id/SC12%2F34%3F56').flush(null, { status: 404, statusText: 'Not Found' });
    await expect(result).resolves.toBeNull();
  });

  it('cancels HTTP work on unsubscription for both owned operations', () => {
    const operations: Observable<unknown>[] = [service.search({ query: 'Tesco', page: 1, pageSize: 10 }), service.getDetails('00445790')];
    for (const operation of operations) {
      const subscription = operation.subscribe();
      const request = http.expectOne(() => true);
      subscription.unsubscribe();
      expect(request.cancelled).toBe(true);
    }
  });

  it('preserves nested false values and every accounts period field', async () => {
    const result = firstValueFrom(service.getDetails('00000001'));
    http.expectOne('/registry_id/00000001').flush({
      name: 'TEST', registryId: '00000001', canFile: false,
      accounts: {
        accounting_reference_date: {},
        last_accounts: { made_up_to: '2024-12-31', period_start_on: '2024-01-01', period_end_on: '2024-12-31', type: 'small' },
        next_accounts: { due_on: '2026-09-30', overdue: false, period_start_on: '2025-01-01', period_end_on: '2025-12-31' },
        next_made_up_to: '2025-12-31', overdue: false,
      },
      confirmationStatement: { last_made_up_to: '2024-01-01', next_made_up_to: '2025-01-01', overdue: false },
      previousCompanyNames: [{}], sicCodes: [],
    });
    await expect(result).resolves.toMatchObject({
      can_file: false,
      accounts: {
        accounting_reference_date: { day: '', month: '' },
        last_accounts: { made_up_to: '2024-12-31', period_start_on: '2024-01-01', period_end_on: '2024-12-31', type: 'small' },
        next_accounts: { due_on: '2026-09-30', overdue: false, period_start_on: '2025-01-01', period_end_on: '2025-12-31' },
        next_made_up_to: '2025-12-31', overdue: false,
      },
      confirmation_statement: { last_made_up_to: '2024-01-01', next_made_up_to: '2025-01-01', overdue: false },
      previous_company_names: [{ name: 'Not available' }], sic_codes: [],
      registered_office_address: undefined,
    });
  });

  it('uses a flat address only when a structured address is absent', async () => {
    const result = firstValueFrom(service.getDetails('00000001'));
    http.expectOne('/registry_id/00000001').flush({ name: 'TEST', registryId: '00000001', address: 'Flat address', accounts: null });
    await expect(result).resolves.toMatchObject({ registered_office_address: { address_line_1: 'Flat address' }, accounts: undefined });
  });
});
