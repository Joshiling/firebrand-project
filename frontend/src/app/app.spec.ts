import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { CompanySearchService } from './companies/company-search.service';
import { MockCompanySearchService } from './companies/mock-company-search.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: CompanySearchService, useClass: MockCompanySearchService }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renders the company search heading and mock-data label', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Company Search');
    expect(compiled.querySelector('.environment')?.textContent).toContain('Sample data');
  });
});
