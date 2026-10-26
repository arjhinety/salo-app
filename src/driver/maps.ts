/**
 * The "Open in Google Maps" handoff and the route as text (DRV-06). Pure: no Expo, no React.
 *
 * The bundled dataset has street names only (its coordinates stay in the CSV files), so the directions use the
 * donor's and the pantry's names and streets, in Quezon City. The URL is the Google Maps directions link that needs no
 * API key. The schematic map is a separate task.
 */

const MAPS_DIRECTIONS = 'https://www.google.com/maps/dir/';

/** A Google Maps driving-directions URL from `origin` to `destination` (free-text places). */
export function directionsUrl(origin: string, destination: string): string {
  return `${MAPS_DIRECTIONS}?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

/** The place text Maps searches for: the name, the street, then the city. */
export function placeText(name: string, street: string): string {
  return `${name}, ${street}, Quezon City`;
}
