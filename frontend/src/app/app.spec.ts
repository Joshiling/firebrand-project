import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { CompanySearchService } from './companies/company-search.service';
import { MockCompanySearchService } from './companies/mock-company-search.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        { provide: CompanySearchService, useClass: MockCompanySearchService },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renders the CompanyLens heading and primary navigation', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand')?.textContent).toContain('CompanyLens');
    expect(compiled.querySelector('nav')?.textContent).toContain('Activity log');
    expect(compiled.querySelector('h1')?.textContent).toContain('Find a UK company');
  });
});
