import type { Evening, World } from '../engine/types';
import { RAW } from './dataset.generated';

/** The bundled Salo Evening Dataset (v1.2) as engine inputs. */
export const DATASET_VERSION = RAW.version;
export const WORLD: World = {
  donors: RAW.donors,
  pantries: RAW.pantries,
  drivers: RAW.drivers,
  roads: RAW.roads,
  driverLegs: RAW.driverLegs,
  lateMinutes: RAW.lateMinutes,
};
export const EVENINGS: readonly Evening[] = RAW.evenings;
