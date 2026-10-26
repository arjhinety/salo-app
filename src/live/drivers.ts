/**
 * The driver reliability panel (DSH-07). Pure TypeScript. The starting estimate is the frozen tuning count (tuning_runs,
 * tuning_shows) through the engine's reliability(), so the panel shows what the agents believe before tonight's runs.
 */
import { reliability } from '../engine/reliability';
import type { Driver, DriverId } from '../engine/types';

export interface DriverTrack {
  id: DriverId;
  name: string;
  /** Tuning shows (completed or completed late) out of tuning runs. */
  shows: number;
  runs: number;
  /** Beta-Bernoulli mean (shows + 1) / (runs + 2), to two decimals in the text. */
  estimate: number;
  /** No tuning run yet: the panel says so instead of showing 0 of 0. */
  newVolunteer: boolean;
}

export function driverTrack(d: Driver): DriverTrack {
  return {
    id: d.id,
    name: d.name,
    shows: d.tuningShows,
    runs: d.tuningRuns,
    estimate: reliability(d.tuningShows, d.tuningRuns),
    newVolunteer: d.tuningRuns === 0,
  };
}

/** Two decimals, as the panel prints an estimate. */
export const estimateText = (x: number): string => x.toFixed(2);
