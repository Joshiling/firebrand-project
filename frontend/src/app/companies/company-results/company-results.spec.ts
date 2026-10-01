import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CompanyResults } from './company-results';

describe('CompanyResults', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('preserves identifiers and search context in links while escaping display strings', () => {
    const fixture = TestBed.createComponent(CompanyResults);
    // Script-shaped input must appear as text, never as an executable DOM element.
    fixture.componentRef.setInput('companies', [{
      name: '<script>alert(1)</script>', registrationNumber: '00002065',
      registeredAddress: { addressLine1: 'One Street', addressLine2: '', locality: 'London', postalCode: 'AB1 2CD' },
    }]);
    fixture.componentRef.setInput('searchParams', {
      q: 'A & B + C', page: 3, status: ['Active', 'Dissolved'], type: ['Plc'], country: 'England',
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const url = new URL(element.querySelector('a')!.href);
    expect(url.pathname).toBe('/companies/00002065');
    expect(url.searchParams.get('q')).toBe('A & B + C');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.getAll('status')).toEqual(['Active', 'Dissolved']);
    expect(url.searchParams.getAll('type')).toEqual(['Plc']);
    expect(url.searchParams.get('country')).toBe('England');
    expect(element.textContent).toContain('<script>alert(1)</script>');
    expect(element.querySelector('script')).toBeNull();
    expect(element.textContent).toContain('One Street, London, AB1 2CD');
    expect(element.textContent).toContain('Not available');
  });

  // [API status, displayed label, CSS tone] covers active, inactive, and fallback states.
  it.each([
    ['ACTIVE', 'Active', 'active'], ['dissolved', 'Dissolved', 'inactive'], ['registered', 'Registered', 'neutral'],
  ])('provides a textual status for %s as well as its visual tone', (status, label, tone) => {
    const fixture = TestBed.createComponent(CompanyResults);
    fixture.componentRef.setInput('companies', [{ name: 'TEST', registrationNumber: 'SC123456', status }]);
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.status') as HTMLElement;
    expect(badge.textContent?.trim()).toBe(label);
    expect(badge.classList.contains(`status--${tone}`)).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Not available');
  });
});