import type { Donor, Driver, DriverLeg, Evening, Pantry, RoadLeg } from '../engine/types';

/** The shape written by scripts/build-data.mjs. Field names already match the engine types. */
export interface RawDataset {
  version: string;
  pantries: Pantry[];
  donors: Donor[];
  drivers: Driver[];
  roads: RoadLeg[];
  driverLegs: DriverLeg[];
  evenings: Evening[];
  lateMinutes: number[];
}
