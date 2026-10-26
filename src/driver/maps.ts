/**
 * The "Open in Google Maps" handoff (DRV-06). Pure: no Expo, no React.
 *
 * The bundled dataset carries coordinates (donors, pantries, drivers' homes), so the directions use latitude and
 * longitude. The URL is the Google Maps directions link that needs no API key. The app draws no turn-by-turn
 * directions; the schematic map is a separate task.
 */
import type { LatLon } from '../data/rawTypes';

const MAPS_DIRECTIONS = 'https://www.google.com/maps/dir/';

/** A Google Maps driving-directions URL from `origin` to `destination`, both given as latitude and longitude. */
export function directionsUrl(origin: LatLon, destination: LatLon): string {
  return (
    `${MAPS_DIRECTIONS}?api=1&origin=${origin.lat},${origin.lon}` +
    `&destination=${destination.lat},${destination.lon}&travelmode=driving`
  );
}
