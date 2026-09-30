import { CompaniesHouseCompanyProfile } from './companies-house-profile';
import { CompanyHistoryEntry } from './company.model';

const northstarCompanies: CompaniesHouseCompanyProfile[] = Array.from(
  { length: 23 },
  (_, index) => ({
    company_name: `NORTHSTAR ${index + 1} LIMITED`,
    company_number: String(1000000 + index).padStart(8, '0'),
    company_status: index % 6 === 0 ? 'dissolved' : 'active',
    type: 'ltd',
    registered_office_address: {
      address_line_1: `${index + 1} Market Street`,
      locality: index % 2 === 0 ? 'Manchester' : 'Leeds',
      postal_code: index % 2 === 0 ? 'M1 1AA' : 'LS1 1AA',
    },
  }),
);

export const MOCK_COMPANY_PROFILES: readonly CompaniesHouseCompanyProfile[] = [
  {
    accounts: {
      accounting_reference_date: { day: '31', month: '12' },
      last_accounts: {
        made_up_to: '2025-12-31',
        period_end_on: '2025-12-31',
        period_start_on: '2025-01-01',
        type: 'group',
      },
      next_accounts: {
        due_on: '2027-06-30',
        overdue: false,
        period_end_on: '2026-12-31',
        period_start_on: '2026-01-01',
      },
      next_due: '2027-06-30',
      next_made_up_to: '2026-12-31',
      overdue: false,
    },
    can_file: true,
    company_name: 'LLOYDS BANK PLC',
    company_number: '00002065',
    company_status: 'active',
    confirmation_statement: {
      last_made_up_to: '2026-05-06',
      next_due: '2027-05-20',
      next_made_up_to: '2027-05-06',
      overdue: false,
    },
    date_of_creation: '1865-04-20',
    etag: '8259055527962f7d8a7133c1d55c10b900e50b46',
    has_charges: false,
    has_insolvency_history: false,
    jurisdiction: 'england-wales',
    last_full_members_list_date: '2016-05-09',
    links: {
      persons_with_significant_control: '/company/00002065/persons-with-significant-control',
      self: '/company/00002065',
      charges: '/company/00002065/charges',
      filing_history: '/company/00002065/filing-history',
      officers: '/company/00002065/officers',
    },
    previous_company_names: [
      {
        ceased_on: '2013-09-23',
        effective_from: '1999-06-28',
        name: 'LLOYDS TSB BANK PLC',
      },
      {
        ceased_on: '1999-06-28',
        effective_from: '1982-02-01',
        name: 'LLOYDS BANK PLC',
      },
      {
        ceased_on: '1982-02-01',
        effective_from: '1889-04-05',
        name: 'LLOYDS BANK LIMITED',
      },
      {
        ceased_on: '1889-04-05',
        effective_from: '1884-04-07',
        name: 'LLOYDS, BARNETTS AND BOSANQUETS BANK LIMITED',
      },
      {
        ceased_on: '1884-04-07',
        effective_from: '1865-04-20',
        name: 'LLOYDS BANKING COMPANY LIMITED',
      },
    ],
    registered_office_address: {
      address_line_1: '25 Gresham Street',
      locality: 'London',
      postal_code: 'EC2V 7HN',
    },
    registered_office_is_in_dispute: false,
    sic_codes: ['64191'],
    type: 'plc',
    undeliverable_registered_office_address: false,
    has_super_secure_pscs: false,
    version_count: 3,
  },
  {
    company_name: 'TESCO PLC',
    company_number: '00445790',
    company_status: 'active',
    type: 'plc',
    registered_office_address: {
      address_line_1: 'Sample House',
      address_line_2: 'Example Business Park',
      locality: 'Welwyn Garden City',
      postal_code: 'AL7 1AA',
    },
  },
  {
    company_name: 'RIVER & FIELD TRADING LTD',
    company_number: 'SC123456',
    company_status: 'active',
    type: 'ltd',
    registered_office_address: {
      address_line_1: '8 Harbour Road',
      locality: 'Edinburgh',
      postal_code: 'EH1 1AA',
    },
  },
  {
    company_name: 'BEACON COMMUNITY INTEREST COMPANY',
    company_number: '09876543',
  },
  ...northstarCompanies,
];

export const MOCK_COMPANY_HISTORY: Readonly<Record<string, readonly CompanyHistoryEntry[]>> = {
  '00002065': [
    {
      versionNumber: 3,
      recordedAt: '2026-09-29T10:30:00Z',
      companyNumber: '00002065',
      companyName: 'LLOYDS BANK PLC',
      companyStatus: 'active',
      incorporationDate: '1865-04-20',
      address: '25 Gresham Street, London, EC2V 7HN',
    },
    {
      versionNumber: 2,
      recordedAt: '2025-05-10T14:15:00Z',
      companyNumber: '00002065',
      companyName: 'LLOYDS BANK PLC',
      companyStatus: 'active',
      incorporationDate: '1865-04-20',
      address: '71 Lombard Street, London, EC3P 3BS',
    },
    {
      versionNumber: 1,
      recordedAt: '2024-01-15T09:00:00Z',
      companyNumber: '00002065',
      companyName: 'LLOYDS BANK LIMITED',
      companyStatus: 'active',
      incorporationDate: '1865-04-20',
      address: '71 Lombard Street, London, EC3P 3BS',
    },
  ],
};
