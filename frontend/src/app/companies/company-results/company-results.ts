import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowUpRight } from '@ng-icons/lucide';
import { CompanySummary } from '../company.model';

@Component({
  selector: 'app-company-results',
  imports: [RouterLink, NgIcon],
  templateUrl: './company-results.html',
  styleUrl: './company-results.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideArrowUpRight })],
})
export class CompanyResults {
  readonly companies = input.required<readonly CompanySummary[]>();
  readonly searchQuery = input('');
  readonly searchPage = input(1);
  readonly searchParams = input<Params>({});

  protected formatAddress(company: CompanySummary): string {
    const address = company.registeredAddress;
    if (!address) {
      return 'Not available';
    }

    const parts = [
      address.addressLine1,
      address.addressLine2,
      address.locality,
      address.postalCode,
    ].filter(Boolean);

    return parts.length ? parts.join(', ') : 'Not available';
  }

  protected displayStatus(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  }

  protected statusTone(status: string): 'active' | 'inactive' | 'neutral' {
    const normalized = status.toLowerCase();
    if (normalized === 'active') {
      return 'active';
    }

    if (normalized === 'dissolved' || normalized === 'inactive') {
      return 'inactive';
    }

    return 'neutral';
  }
}
