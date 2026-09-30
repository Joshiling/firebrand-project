import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Params, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideBuilding2,
  lucideCircleAlert,
  lucideFileClock,
  lucideHistory,
  lucideLandmark,
  lucideMapPin,
  lucideRefreshCw,
  lucideShieldCheck,
  lucideSearchX,
} from '@ng-icons/lucide';
import { catchError, map, of, Subject, switchMap } from 'rxjs';
import { CompaniesHouseCompanyProfile } from '../companies-house-profile';
import { CompanySearchService } from '../company-search.service';

type DetailOutcome =
  { kind: 'success'; profile: CompaniesHouseCompanyProfile | null } | { kind: 'error' };

@Component({
  selector: 'app-company-details',
  imports: [RouterLink, NgIcon],
  templateUrl: './company-details.html',
  styleUrl: './company-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideBuilding2,
      lucideCircleAlert,
      lucideFileClock,
      lucideHistory,
      lucideLandmark,
      lucideMapPin,
      lucideRefreshCw,
      lucideShieldCheck,
      lucideSearchX,
    }),
  ],
})
export class CompanyDetails {
  private readonly route = inject(ActivatedRoute);
  private readonly searchService = inject(CompanySearchService);
  private readonly title = inject(Title);
  private readonly requests = new Subject<string>();
  private currentRegistrationNumber = '';

  protected readonly profile = signal<CompaniesHouseCompanyProfile | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly requestFailed = signal(false);
  protected readonly backQueryParams: Params;

  constructor() {
    // Carry the originating search state into the Back link. Query parameters are optional so a
    // directly opened company URL still works without inventing search values.
    this.backQueryParams = this.route.snapshot.queryParams;

    // As on the search page, switchMap discards an older in-flight lookup if the route changes.
    // Converting success and failure into values keeps all view-state updates in one subscription.
    this.requests
      .pipe(
        switchMap((registrationNumber) =>
          this.searchService.getDetails(registrationNumber).pipe(
            map((profile): DetailOutcome => ({ kind: 'success', profile })),
            catchError(() => of<DetailOutcome>({ kind: 'error' })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((outcome) => {
        this.loading.set(false);

        if (outcome.kind === 'error') {
          this.requestFailed.set(true);
          this.title.setTitle('Company details unavailable | CompanyLens');
          return;
        }

        this.profile.set(outcome.profile);
        this.notFound.set(!outcome.profile);
        this.title.setTitle(
          outcome.profile
            ? `${outcome.profile.company_name} | CompanyLens`
            : 'Company not found | CompanyLens',
        );
      });

    this.route.paramMap
      .pipe(
        map((params) => params.get('registrationNumber')?.trim() ?? ''),
        takeUntilDestroyed(),
      )
      .subscribe((registrationNumber) => this.requestDetails(registrationNumber));
  }

  protected retry(): void {
    this.requestDetails(this.currentRegistrationNumber);
  }

  protected formatAddress(profile: CompaniesHouseCompanyProfile): string {
    const address = profile.registered_office_address;
    const parts = [
      address?.address_line_1,
      address?.address_line_2,
      address?.locality,
      address?.region,
      address?.postal_code,
      address?.country,
    ].filter(Boolean);

    return parts.length ? parts.join(', ') : 'Not available';
  }

  protected formatDate(value?: string): string {
    if (!value) {
      return 'Not available';
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      return value;
    }

    // Build the date in UTC so a date-only API value cannot shift by one day in another timezone.
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }

  protected formatDateRange(effectiveFrom?: string, ceasedOn?: string): string {
    if (effectiveFrom && ceasedOn) {
      return `${this.formatDate(effectiveFrom)} to ${this.formatDate(ceasedOn)}`;
    }

    if (effectiveFrom) {
      return `From ${this.formatDate(effectiveFrom)}`;
    }

    if (ceasedOn) {
      return `Until ${this.formatDate(ceasedOn)}`;
    }

    return 'Dates not available';
  }

  protected formatLabel(value?: string): string {
    if (!value) {
      return 'Not available';
    }

    return value
      .replaceAll('_', ' ')
      .replaceAll('-', ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  protected booleanLabel(value?: boolean): string {
    return value === undefined ? 'Not available' : value ? 'Yes' : 'No';
  }

  protected linkEntries(profile: CompaniesHouseCompanyProfile): readonly [string, string][] {
    return Object.entries(profile.links ?? {});
  }

  protected statusTone(status?: string): 'active' | 'inactive' | 'neutral' {
    const normalized = status?.toLowerCase();
    if (normalized === 'active') {
      return 'active';
    }

    if (normalized === 'dissolved' || normalized === 'inactive') {
      return 'inactive';
    }

    return 'neutral';
  }

  private requestDetails(registrationNumber: string): void {
    this.currentRegistrationNumber = registrationNumber;
    this.loading.set(true);
    this.notFound.set(false);
    this.requestFailed.set(false);
    this.profile.set(null);
    this.requests.next(registrationNumber);
  }
}
