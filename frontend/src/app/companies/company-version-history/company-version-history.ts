import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideRefreshCw } from '@ng-icons/lucide';
import { CompanyHistoryEntry } from '../company.model';

@Component({
  selector: 'app-company-version-history',
  imports: [NgIcon],
  templateUrl: './company-version-history.html',
  styleUrl: './company-version-history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideCircleAlert, lucideRefreshCw })],
})
export class CompanyVersionHistory {
  readonly entries = input.required<readonly CompanyHistoryEntry[]>();
  readonly loading = input(false);
  readonly failed = input(false);
  readonly retry = output<void>();

  protected formatDate(value?: string): string {
    if (!value) {
      return 'Not available';
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      return value;
    }

    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }

  protected formatTimestamp(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(date);
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

  protected changedFields(
    entry: CompanyHistoryEntry,
    previous?: CompanyHistoryEntry,
  ): readonly string[] {
    if (!previous) {
      return ['Initial record'];
    }

    const fields: readonly [keyof CompanyHistoryEntry, string][] = [
      ['companyName', 'Company name'],
      ['companyStatus', 'Status'],
      ['incorporationDate', 'Incorporation date'],
      ['address', 'Address'],
      ['externalRegistrationNumber', 'External registration number'],
    ];

    return fields
      .filter(([field]) => (entry[field] ?? '') !== (previous[field] ?? ''))
      .map(([, label]) => label);
  }
}