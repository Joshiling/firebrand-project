import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideActivity,
  lucideCircleAlert,
  lucideDatabase,
  lucideRefreshCw,
  lucideSearch,
  lucideX,
} from '@ng-icons/lucide';
import { catchError, map, of, Subject, switchMap } from 'rxjs';
import { Pagination } from '../companies/pagination/pagination';
import { SearchLogPage } from './search-log.model';
import { SearchLogService } from './search-log.service';

type LogOutcome = { kind: 'success'; result: SearchLogPage } | { kind: 'error' };
type LogRequest = { page: number; query: string };

@Component({
  selector: 'app-search-logs',
  imports: [NgIcon, Pagination, ReactiveFormsModule],
  templateUrl: './search-logs.html',
  styleUrl: './search-logs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      lucideActivity,
      lucideCircleAlert,
      lucideDatabase,
      lucideRefreshCw,
      lucideSearch,
      lucideX,
    }),
  ],
})
export class SearchLogs {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly searchLogService = inject(SearchLogService);
  private readonly requests = new Subject<LogRequest>();
  private readonly dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  protected readonly pageSize = 20;
  protected readonly filterForm = new FormGroup({
    query: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(100)],
    }),
  });
  protected readonly result = signal<SearchLogPage | null>(null);
  protected readonly currentPage = signal(1);
  protected readonly submittedQuery = signal('');
  protected readonly loading = signal(false);
  protected readonly requestFailed = signal(false);

  constructor() {
    this.requests
      .pipe(
        switchMap((request) =>
          this.searchLogService.getPage(request.page, this.pageSize, request.query).pipe(
            map((result): LogOutcome => ({ kind: 'success', result })),
            catchError(() => of<LogOutcome>({ kind: 'error' })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((outcome) => {
        this.loading.set(false);
        if (outcome.kind === 'error') {
          this.requestFailed.set(true);
          return;
        }

        this.result.set(outcome.result);
      });

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const query = params.get('q')?.trim() ?? '';
      const requestedPage = Number(params.get('page'));
      const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
      this.filterForm.controls.query.setValue(query);
      this.submittedQuery.set(query);
      this.currentPage.set(page);
      this.requestPage(page, query);
    });
  }

  protected submitFilter(): void {
    this.filterForm.controls.query.markAsTouched();
    if (this.filterForm.invalid) {
      return;
    }

    const query = this.filterForm.controls.query.value.trim();
    if (query === this.submittedQuery() && this.currentPage() === 1) {
      this.requestPage(1, query);
      return;
    }

    this.updateUrl(1, query);
  }

  protected clearFilter(): void {
    this.filterForm.controls.query.setValue('');
    this.updateUrl(1, '');
  }

  protected changePage(page: number): void {
    if (!this.loading()) {
      this.updateUrl(page, this.submittedQuery());
    }
  }

  protected retry(): void {
    this.requestPage(this.currentPage(), this.submittedQuery());
  }

  protected formatTimestamp(timestamp: string): string {
    return this.dateFormatter.format(new Date(timestamp));
  }

  protected statusLabel(status: number): string {
    if (status >= 200 && status < 300) {
      return 'Successful';
    }

    if (status === 404) {
      return 'Not found';
    }

    return 'Failed';
  }

  private requestPage(page: number, query: string): void {
    this.loading.set(true);
    this.requestFailed.set(false);
    this.result.set(null);
    this.requests.next({ page, query });
  }

  private updateUrl(page: number, query: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: query || null, page },
      replaceUrl: true,
    });
  }
}
