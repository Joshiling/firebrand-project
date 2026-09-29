import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, throwError } from 'rxjs';
import { CompaniesHouseCompanyProfile } from '../companies-house-profile';
import { CompanySearchPage, CompanySearchRequest } from '../company.model';
import { CompanySearchService } from '../company-search.service';
import { MOCK_COMPANY_PROFILES } from '../mock-companies';
import { CompanyDetails } from './company-details';

class DetailsServiceStub extends CompanySearchService {
  profile: CompaniesHouseCompanyProfile | null = MOCK_COMPANY_PROFILES[0];
  shouldFail = false;

  override readonly getDetails = vi.fn(
    (registrationNumber: string): Observable<CompaniesHouseCompanyProfile | null> => {
      if (this.shouldFail) {
        return throwError(() => new Error('Service unavailable'));
      }

      return of(this.profile);
    },
  );

  override search(_request: CompanySearchRequest): Observable<CompanySearchPage> {
    return of({ items: [], totalResults: 0, page: 1, pageSize: 10 });
  }
}

describe('CompanyDetails', () => {
  let harness: RouterTestingHarness;
  let service: DetailsServiceStub;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'companies/:registrationNumber', component: CompanyDetails }]),
        { provide: CompanySearchService, useClass: DetailsServiceStub },
      ],
    }).compileComponents();

    harness = await RouterTestingHarness.create();
    service = TestBed.inject(CompanySearchService) as DetailsServiceStub;
  });

  async function navigate(url: string): Promise<HTMLElement> {
    await harness.navigateByUrl(url, CompanyDetails);
    harness.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  it('renders the complete profile and preserves search context', async () => {
    const element = await navigate('/companies/00002065?q=Lloyds&page=2');

    expect(service.getDetails).toHaveBeenCalledWith('00002065');
    expect(element.textContent).toContain('LLOYDS BANK PLC');
    expect(element.textContent).toContain('25 Gresham Street, London, EC2V 7HN');
    expect(element.textContent).toContain('30 Jun 2027');
    expect(element.textContent).toContain('LLOYDS TSB BANK PLC');
    expect(element.querySelector('.back-link')?.getAttribute('href')).toBe('/?q=Lloyds&page=2');
  });

  it('renders useful fallbacks for a sparse profile', async () => {
    service.profile = MOCK_COMPANY_PROFILES.find(
      (profile) => profile.company_number === '09876543',
    )!;

    const element = await navigate('/companies/09876543');

    expect(element.textContent).toContain('BEACON COMMUNITY INTEREST COMPANY');
    expect(element.textContent).toContain('Accounts information is not available.');
    expect(element.textContent).toContain('No previous company names are available.');
  });

  it('shows a not-found state for an unknown registration number', async () => {
    service.profile = null;

    const element = await navigate('/companies/99999999');

    expect(element.textContent).toContain('Company not found');
  });

  it('shows a request error and can retry', async () => {
    service.shouldFail = true;
    const element = await navigate('/companies/00002065');

    expect(element.textContent).toContain('We could not load this company');

    service.shouldFail = false;
    (element.querySelector('button') as HTMLButtonElement).click();
    harness.detectChanges();

    expect(service.getDetails).toHaveBeenCalledTimes(2);
    expect(element.textContent).toContain('LLOYDS BANK PLC');
  });

  it('passes a prefixed registration number to the service unchanged', async () => {
    service.profile = MOCK_COMPANY_PROFILES.find(
      (profile) => profile.company_number === 'SC123456',
    )!;

    await navigate('/companies/SC123456');

    expect(service.getDetails).toHaveBeenCalledWith('SC123456');
  });
});
