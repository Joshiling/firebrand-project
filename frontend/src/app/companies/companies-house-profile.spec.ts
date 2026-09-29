import { mapCompaniesHouseProfile } from './companies-house-profile';
import { MOCK_COMPANY_PROFILES } from './mock-companies';

describe('mapCompaniesHouseProfile', () => {
  it('maps the Companies House response into the frontend display model', () => {
    const lloydsProfile = MOCK_COMPANY_PROFILES.find(
      (profile) => profile.company_number === '00002065',
    );

    expect(lloydsProfile).toBeDefined();
    expect(mapCompaniesHouseProfile(lloydsProfile!)).toEqual({
      name: 'LLOYDS BANK PLC',
      registrationNumber: '00002065',
      status: 'active',
      type: 'plc',
      registeredAddress: {
        addressLine1: '25 Gresham Street',
        addressLine2: undefined,
        locality: 'London',
        postalCode: 'EC2V 7HN',
      },
    });
  });
});
