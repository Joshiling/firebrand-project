export type CompanyQueryKind = 'name' | 'registrationNumber';

const COMPANY_NUMBER_PATTERN = /^(?:\d{8}|[a-z]{2}\d{6})$/i;

export function classifyCompanyQuery(query: string): CompanyQueryKind {
  return COMPANY_NUMBER_PATTERN.test(query.trim()) ? 'registrationNumber' : 'name';
}
