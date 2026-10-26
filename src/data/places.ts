import { RAW } from './dataset.generated';
import type { LatLon } from './rawTypes';

/**
 * Positions of the bundled places, from the dataset CSVs (lat, lon for donors and pantries; home_lat, home_lon for
 * drivers). Used by the schematic map and the driver's maps link. The engine never reads these (decision D-05).
 */
const DONOR_AT = new Map(RAW.donors.map((d) => [d.id, { lat: d.lat, lon: d.lon }] as const));
const PANTRY_AT = new Map(RAW.pantries.map((p) => [p.id, { lat: p.lat, lon: p.lon }] as const));
const DRIVER_AT = new Map(RAW.drivers.map((d) => [d.id, { lat: d.homeLat, lon: d.homeLon }] as const));

export const donorPosition = (id: string): LatLon | undefined => DONOR_AT.get(id);
export const pantryPosition = (id: string): LatLon | undefined => PANTRY_AT.get(id);
/** A driver's home, the only place a driver has on the map. */
export const driverPosition = (id: string): LatLon | undefined => DRIVER_AT.get(id);

/** Every bundled place with its position, for the map's fixed frame (the same frame whatever is shown). */
export const ALL_POSITIONS: readonly LatLon[] = [...DONOR_AT.values(), ...PANTRY_AT.values(), ...DRIVER_AT.values()];
