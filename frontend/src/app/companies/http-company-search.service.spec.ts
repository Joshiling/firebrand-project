import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
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
    request.flush({
      name: 'LLOYDS BANK PLC',
      registryId: '00002065',
      address: '25 Gresham Street, London, EC2V 7HN',
      companyStatus: 'active',
      companyType: 'plc',
      accounts: {
        accountingReferenceDate: { day: '31', month: '12' },
        nextDue: '2027-06-30',
        overdue: false,
      },
      canFile: true,
      confirmationStatement: {
        nextDue: '2027-05-20',
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
          effectiveFrom: '1999-06-28',
          ceasedOn: '2013-09-23',
        },
      ],
      registeredOfficeAddress: {
        addressLine1: '25 Gresham Street',
        country: 'United Kingdom',
        locality: 'London',
        postalCode: 'EC2V 7HN',
        region: 'Greater London',
      },
      registeredOfficeIsInDispute: false,
      sicCodes: ['64191'],
      undeliverableRegisteredOfficeAddress: false,
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
    });
  });

  it('returns null when the backend reports that details were not found', async () => {
    const resultPromise = firstValueFrom(service.getDetails('99999999'));
    const request = http.expectOne('/registry_id/99999999');
    request.flush(null, { status: 404, statusText: 'Not Found' });

    await expect(resultPromise).resolves.toBeNull();
  });
});
