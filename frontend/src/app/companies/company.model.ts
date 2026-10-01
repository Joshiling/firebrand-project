export interface RegisteredAddress {
  addressLine1?: string;
  addressLine2?: string;
  locality?: string;
  postalCode?: string;
}

export interface CompanySummary {
  name: string;
  registrationNumber: string;
  status?: string;
  type?: string;
  registeredAddress?: RegisteredAddress;
}

export interface CompanySearchRequest {
  query: string;
  page: number;
  pageSize: number;
  companyStatuses?: readonly string[];
  companyTypes?: readonly string[];
  country?: string;
}

export interface CompanyFilterOptions {
  companyStatuses: readonly string[];
  companyTypes: readonly string[];
  countries: readonly string[];
}

export interface CompanySearchPage {
  items: readonly CompanySummary[];
  totalResults: number;
  page: number;
  pageSize: number;
}

export interface CompanyHistoryEntry {
  versionNumber: number;
  recordedAt: string;
  companyNumber: string;
  companyName: string;
  companyStatus?: string;
  incorporationDate?: string;
  address?: string;
  externalRegistrationNumber?: string;
}
