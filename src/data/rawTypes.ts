import type { Donor, Driver, DriverLeg, Evening, Pantry, RoadLeg } from '../engine/types';

/** A place's position from the dataset CSVs (WGS84 degrees). Used only by the map and the driver maps link, never by the engine. */
export interface LatLon {
  lat: number;
  lon: number;
}

/** The shape written by scripts/build-data.mjs. Field names already match the engine types; coordinates are extra fields. */
export interface RawDataset {
  version: string;
  pantries: (Pantry & LatLon)[];
  donors: (Donor & LatLon)[];
  drivers: (Driver & { homeLat: number; homeLon: number })[];
  roads: RoadLeg[];
  driverLegs: DriverLeg[];
  evenings: Evening[];
  lateMinutes: number[];
}
