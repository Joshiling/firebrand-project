import { CompanySummary } from './company.model';

const northstarCompanies: CompanySummary[] = Array.from({ length: 23 }, (_, index) => ({
  name: `Northstar ${index + 1} Limited`,
  registrationNumber: String(1000000 + index).padStart(8, '0'),
  status: index % 6 === 0 ? 'Dissolved' : 'Active',
  type: 'Private limited company',
  registeredAddress: {
    addressLine1: `${index + 1} Market Street`,
    locality: index % 2 === 0 ? 'Manchester' : 'Leeds',
    postalCode: index % 2 === 0 ? 'M1 1AA' : 'LS1 1AA',
  },
}));

export const MOCK_COMPANIES: readonly CompanySummary[] = [
  {
    name: 'Tesco PLC',
    registrationNumber: '00445790',
    status: 'Active',
    type: 'Public limited company',
    registeredAddress: {
      addressLine1: 'Sample House',
      addressLine2: 'Example Business Park',
      locality: 'Welwyn Garden City',
      postalCode: 'AL7 1AA',
    },
  },
  {
    name: 'River & Field Trading Ltd',
    registrationNumber: 'SC123456',
    status: 'Active',
    type: 'Private limited company',
    registeredAddress: {
      addressLine1: '8 Harbour Road',
      locality: 'Edinburgh',
      postalCode: 'EH1 1AA',
    },
  },
  {
    name: 'Beacon Community Interest Company',
    registrationNumber: '09876543',
  },
  ...northstarCompanies,
];
