import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
  FormControl,
  FormGroup,
} from '@angular/forms';
import { catchError, map, of, Subject, switchMap } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideSearch, lucideSearchX } from '@ng-icons/lucide';
import { CompanySearchPage, CompanySearchRequest } from '../company.model';
import { CompanySearchService } from '../company-search.service';
import { CompanyResults } from '../company-results/company-results';
import { Pagination } from '../pagination/pagination';

function requiredTrimmed(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() ? null : { required: true };
}

type SearchOutcome = { kind: 'success'; result: CompanySearchPage } | { kind: 'error' };

@Component({
  selector: 'app-company-search',
  imports: [ReactiveFormsModule, CompanyResults, Pagination, NgIcon],
  templateUrl: './company-search.html',
  styleUrl: './company-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideCircleAlert, lucideSearch, lucideSearchX })],
})
export class CompanySearch {
  private readonly searchService = inject(CompanySearchService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly requests = new Subject<CompanySearchRequest>();
  private lastSubmittedQuery = '';
  private lastRequestedKey = '';

  protected readonly pageSize = 10;
  protected readonly searchForm = new FormGroup({
    query: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, requiredTrimmed],
    }),
  });
  protected readonly result = signal<CompanySearchPage | null>(null);
  protected readonly loading = signal(false);
  protected readonly hasSearched = signal(false);
  protected readonly requestFailed = signal(false);
  protected readonly submittedQuery = signal('');
  protected readonly currentPage = signal(1);

  constructor() {
    this.requests
      .pipe(
        switchMap((request) =>
          this.searchService.search(request).pipe(
            map((result): SearchOutcome => ({ kind: 'success', result })),
            catchError(() => of<SearchOutcome>({ kind: 'error' })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((outcome) => {
        this.loading.set(false);
        this.hasSearched.set(true);

        if (outcome.kind === 'error') {
          this.requestFailed.set(true);
          return;
        }

        this.result.set(outcome.result);
      });

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const query = params.get('q')?.trim() ?? '';
      if (!query) {
        return;
      }

      const requestedPage = Number(params.get('page'));
      const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
      const requestKey = `${query.toLocaleLowerCase()}::${page}`;

      this.searchForm.controls.query.setValue(query);
      this.lastSubmittedQuery = query;
      this.submittedQuery.set(query);
      this.currentPage.set(page);

      if (requestKey !== this.lastRequestedKey) {
        this.requestPage(page);
      }
    });
  }

  protected submitSearch(): void {
    this.searchForm.controls.query.markAsTouched();
    this.searchForm.controls.query.updateValueAndValidity();

    if (this.searchForm.invalid) {
      return;
    }

    this.lastSubmittedQuery = this.searchForm.controls.query.value.trim();
    this.submittedQuery.set(this.lastSubmittedQuery);
    this.currentPage.set(1);
    this.requestPage(1);
    this.updateSearchUrl(1);
  }

  protected changePage(page: number): void {
    if (!this.loading() && this.lastSubmittedQuery) {
      this.currentPage.set(page);
      this.requestPage(page);
      this.updateSearchUrl(page);
    }
  }

  private requestPage(page: number): void {
    this.lastRequestedKey = `${this.lastSubmittedQuery.toLocaleLowerCase()}::${page}`;
    this.loading.set(true);
    this.hasSearched.set(false);
    this.requestFailed.set(false);
    this.result.set(null);
    this.requests.next({ query: this.lastSubmittedQuery, page, pageSize: this.pageSize });
  }

  private updateSearchUrl(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: this.lastSubmittedQuery, page },
      replaceUrl: true,
    });
  }
}
