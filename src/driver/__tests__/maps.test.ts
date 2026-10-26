import { directionsUrl } from '../maps';
import { donorPosition, pantryPosition } from '../../data/places';

describe('Google Maps directions link (DRV-06)', () => {
  it('builds the key-free directions URL from the donor coordinates to the pantry coordinates', () => {
    const origin = { lat: 14.621697, lon: 121.050233 }; // D01 Karinderya ni Aling Oning (donors.csv)
    const destination = { lat: 14.622694, lon: 121.058242 }; // P01 Bukal Community Kitchen (pantries.csv)
    expect(directionsUrl(origin, destination)).toBe(
      'https://www.google.com/maps/dir/?api=1' +
        '&origin=14.621697,121.050233' +
        '&destination=14.622694,121.058242' +
        '&travelmode=driving',
    );
  });

  it('takes the bundled coordinates of D01 and P01 from the dataset', () => {
    expect(donorPosition('D01')).toEqual({ lat: 14.621697, lon: 121.050233 });
    expect(pantryPosition('P01')).toEqual({ lat: 14.622694, lon: 121.058242 });
  });

  it('never puts a place name or a Maps key in the link', () => {
    const url = directionsUrl({ lat: 14.6, lon: 121.0 }, { lat: 14.7, lon: 121.1 });
    expect(url).not.toMatch(/key=|Bukal|Aurora|%20/);
  });
});
