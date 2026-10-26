import { directionsUrl, placeText } from '../maps';

describe('Google Maps directions link (DRV-06)', () => {
  it('builds the key-free directions URL from the donor to the pantry, with street names', () => {
    const origin = placeText('Karinderya ni Aling Oning', 'Aurora Boulevard');
    const destination = placeText('Bukal Community Kitchen', '15th Avenue');
    expect(origin).toBe('Karinderya ni Aling Oning, Aurora Boulevard, Quezon City');
    expect(directionsUrl(origin, destination)).toBe(
      'https://www.google.com/maps/dir/?api=1' +
        '&origin=Karinderya%20ni%20Aling%20Oning%2C%20Aurora%20Boulevard%2C%20Quezon%20City' +
        '&destination=Bukal%20Community%20Kitchen%2C%2015th%20Avenue%2C%20Quezon%20City' +
        '&travelmode=driving',
    );
  });
});
