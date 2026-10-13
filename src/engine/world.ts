import type { DonorId, DriverId, PantryId, RoadLeg, VehicleKind, World } from './types';

/** Fast lookups over a World. Built once; the engine never searches arrays in its inner loop. */
export interface WorldIndex {
  world: World;
  road(donorId: DonorId, pantryId: PantryId): RoadLeg;
  /** Minutes from a driver's home to a donor, in the driver's own vehicle (dataset v1.2). */
  homeToDonor(driverId: DriverId, donorId: DonorId): number;
  /** Minutes from a pantry back to a donor; roads are two-way, so this is the donor-to-pantry leg. */
  pantryToDonor(pantryId: PantryId, donorId: DonorId, vehicle: VehicleKind): number;
  maxRoadKm: number;
  pantryIndex: ReadonlyMap<PantryId, number>;
  driverIndex: ReadonlyMap<DriverId, number>;
}

export function indexWorld(world: World): WorldIndex {
  const roads = new Map<string, RoadLeg>();
  for (const r of world.roads) roads.set(`${r.donorId}|${r.pantryId}`, r);
  const home = new Map<string, number>();
  for (const l of world.driverLegs) home.set(`${l.driverId}|${l.donorId}`, l.minutes);
  const road = (d: DonorId, p: PantryId) => {
    const r = roads.get(`${d}|${p}`);
    if (!r) throw new Error(`no road leg ${d} -> ${p}`);
    return r;
  };
  return {
    world,
    road,
    homeToDonor(driverId, donorId) {
      const m = home.get(`${driverId}|${donorId}`);
      if (m === undefined) throw new Error(`no driver leg ${driverId} -> ${donorId}`);
      return m;
    },
    pantryToDonor: (p, d, v) => road(d, p).minutes[v],
    maxRoadKm: Math.max(...world.roads.map((r) => r.roadKm)),
    pantryIndex: new Map(world.pantries.map((p, i) => [p.id, i])),
    driverIndex: new Map(world.drivers.map((d, i) => [d.id, i])),
  };
}
