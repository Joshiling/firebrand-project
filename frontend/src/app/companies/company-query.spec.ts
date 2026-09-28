import { classifyCompanyQuery } from './company-query';

describe('classifyCompanyQuery', () => {
  it.each(['00002065', '00445790', 'SC123456', 'sc123456'])(
    'classifies %s as a registration number',
    (query) => {
      expect(classifyCompanyQuery(query)).toBe('registrationNumber');
    },
  );

  it.each(['Lloyds Bank', 'Tesco', '123 Limited', '1234'])(
    'classifies %s as a company name',
    (query) => {
      expect(classifyCompanyQuery(query)).toBe('name');
    },
  );
});
