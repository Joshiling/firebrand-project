import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideActivity,
  lucideCircleAlert,
  lucideDatabase,
  lucideRefreshCw,
} from '@ng-icons/lucide';
import { catchError, map, of, Subject, switchMap } from 'rxjs';
import { Pagination } from '../companies/pagination/pagination';
import { SearchLogPage } from './search-log.model';
import { SearchLogService } from './search-log.service';

type LogOutcome = { kind: 'success'; result: SearchLogPage } | { kind: 'error' };

@Component({
  selector: 'app-search-logs',
  imports: [NgIcon, Pagination],
  templateUrl: './search-logs.html',
  styleUrl: './search-logs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideActivity, lucideCircleAlert, lucideDatabase, lucideRefreshCw })],
})
export class SearchLogs {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly searchLogService = inject(SearchLogService);
  private readonly requests = new Subject<number>();
  private readonly dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  protected readonly pageSize = 20;
  protected readonly result = signal<SearchLogPage | null>(null);
  protected readonly currentPage = signal(1);
  protected readonly loading = signal(false);
  protected readonly requestFailed = signal(false);

  constructor() {
    this.requests
      .pipe(
        switchMap((page) =>
          this.searchLogService.getPage(page, this.pageSize).pipe(
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
      const requestedPage = Number(params.get('page'));
      const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
      this.currentPage.set(page);
      this.requestPage(page);
    });
  }

  protected changePage(page: number): void {
    if (!this.loading()) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { page },
        replaceUrl: true,
      });
    }
  }

  protected retry(): void {
    this.requestPage(this.currentPage());
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

  private requestPage(page: number): void {
    this.loading.set(true);
    this.requestFailed.set(false);
    this.result.set(null);
    this.requests.next(page);
  }
}
