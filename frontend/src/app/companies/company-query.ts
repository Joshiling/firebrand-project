export type CompanyQueryKind = 'name' | 'registrationNumber';

// Common UK company numbers are eight digits or a two-letter prefix followed by six digits.
// Numbers stay as strings so leading zeroes and prefixes such as SC are never lost.
const COMPANY_NUMBER_PATTERN = /^(?:\d{8}|[a-z]{2}\d{6})$/i;

export function classifyCompanyQuery(query: string): CompanyQueryKind {
  return COMPANY_NUMBER_PATTERN.test(query.trim()) ? 'registrationNumber' : 'name';
}
