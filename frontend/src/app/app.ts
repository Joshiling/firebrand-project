import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CompanySearch } from './companies/company-search/company-search';

@Component({
  imports: [CompanySearch],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app-shell.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
