import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CompanySummary } from '../company.model';

@Component({
  selector: 'app-company-results',
  templateUrl: './company-results.html',
  styleUrl: './company-results.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyResults {
  readonly companies = input.required<readonly CompanySummary[]>();

  protected formatAddress(company: CompanySummary): string {
    const address = company.registeredAddress;
    if (!address) {
      return 'Not available';
    }

    return [address.addressLine1, address.addressLine2, address.locality, address.postalCode]
      .filter(Boolean)
      .join(', ');
  }
}
