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
  imports: [ReactiveFormsModule, CompanyResults, Pagination],
  templateUrl: './company-search.html',
  styleUrl: './company-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanySearch {
  private readonly searchService = inject(CompanySearchService);
  private readonly requests = new Subject<CompanySearchRequest>();
  private lastSubmittedQuery = '';

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
  }

  protected submitSearch(): void {
    this.searchForm.controls.query.markAsTouched();
    this.searchForm.controls.query.updateValueAndValidity();

    if (this.searchForm.invalid) {
      return;
    }

    this.lastSubmittedQuery = this.searchForm.controls.query.value.trim();
    this.requestPage(1);
  }

  protected changePage(page: number): void {
    if (!this.loading() && this.lastSubmittedQuery) {
      this.requestPage(page);
    }
  }

  private requestPage(page: number): void {
    this.loading.set(true);
    this.hasSearched.set(false);
    this.requestFailed.set(false);
    this.result.set(null);
    this.requests.next({ query: this.lastSubmittedQuery, page, pageSize: this.pageSize });
  }
}
