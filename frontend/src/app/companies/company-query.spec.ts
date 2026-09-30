import { classifyCompanyQuery } from './company-query';

describe('classifyCompanyQuery', () => {
  it.each(['00002065', '00445790', 'SC123456', 'sc123456', '  NI000001  ', '00000000'])(
    'classifies %s as a registration number',
    (query) => {
      expect(classifyCompanyQuery(query)).toBe('registrationNumber');
    },
  );

  it.each(['Lloyds Bank', 'Tesco', '123 Limited', '1234', '', '   ', '1234567', '123456789', 'A1234567', 'ABC12345', 'SC12345X', 'SC 123456'])(
    'classifies %s as a company name',
    (query) => {
      expect(classifyCompanyQuery(query)).toBe('name');
    },
  );
});
