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

  it('keeps absent optional fields absent instead of inventing defaults', () => {
    expect(mapCompaniesHouseProfile({ company_name: 'SPARSE', company_number: '00000001' })).toEqual({
      name: 'SPARSE', registrationNumber: '00000001', status: undefined, type: undefined, registeredAddress: undefined,
    });
  });

  it('maps address fields without mutating or aliasing the source address', () => {
    // Frozen inputs expose accidental mutation; a distinct output address avoids shared state.
    const address = Object.freeze({ address_line_1: 'One', address_line_2: 'Two', locality: 'Town', postal_code: 'AB1 2CD' });
    const profile = Object.freeze({ company_name: 'TEST', company_number: 'SC123456', registered_office_address: address });
    const summary = mapCompaniesHouseProfile(profile);
    expect(summary.registeredAddress).toEqual({ addressLine1: 'One', addressLine2: 'Two', locality: 'Town', postalCode: 'AB1 2CD' });
    expect(summary.registeredAddress).not.toBe(address);
  });
});
