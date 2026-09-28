import { CompanySummary } from './company.model';

export interface CompaniesHouseCompanyProfile {
  accounts?: {
    accounting_reference_date?: { day: string; month: string };
    last_accounts?: {
      made_up_to?: string;
      period_end_on?: string;
      period_start_on?: string;
      type?: string;
    };
    next_accounts?: {
      due_on?: string;
      overdue?: boolean;
      period_end_on?: string;
      period_start_on?: string;
    };
    next_due?: string;
    next_made_up_to?: string;
    overdue?: boolean;
  };
  can_file?: boolean;
  company_name: string;
  company_number: string;
  company_status?: string;
  confirmation_statement?: {
    last_made_up_to?: string;
    next_due?: string;
    next_made_up_to?: string;
    overdue?: boolean;
  };
  date_of_creation?: string;
  etag?: string;
  has_charges?: boolean;
  has_insolvency_history?: boolean;
  jurisdiction?: string;
  last_full_members_list_date?: string;
  links?: Record<string, string>;
  previous_company_names?: readonly {
    ceased_on: string;
    effective_from: string;
    name: string;
  }[];
  registered_office_address?: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    postal_code?: string;
  };
  registered_office_is_in_dispute?: boolean;
  sic_codes?: readonly string[];
  type?: string;
  undeliverable_registered_office_address?: boolean;
  has_super_secure_pscs?: boolean;
}

export function mapCompaniesHouseProfile(profile: CompaniesHouseCompanyProfile): CompanySummary {
  const address = profile.registered_office_address;

  return {
    name: profile.company_name,
    registrationNumber: profile.company_number,
    status: profile.company_status,
    type: profile.type,
    registeredAddress: address
      ? {
          addressLine1: address.address_line_1,
          addressLine2: address.address_line_2,
          locality: address.locality,
          postalCode: address.postal_code,
        }
      : undefined,
  };
}
