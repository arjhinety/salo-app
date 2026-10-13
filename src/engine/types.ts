/**
 * Salo engine types: the shared vocabulary of the in-app agent simulation.
 *
 * This file is pure TypeScript. It imports nothing: no React, no Expo, no React
 * Native, no Node. The engine (src/engine/**) may depend on this file and on
 * nothing else outside src/engine/. See docs/architecture.md, sections 1 and 2.
 *
 * Conventions
 * - Minute: integer minutes after local midnight (Asia/Manila, no DST). 16:00 = 960.
 * - Mass: kilograms as plain numbers. Round only when displaying.
 * - IDs: dataset IDs are kept verbatim ("D01", "P03", "V01", "L0014").
 *   Lots posted live from a phone get "LIVE-<n>".
 * - Ratios and utilities are in [0, 1] unless a field says otherwise.
 * - Dataset-derived values are the only inputs. The engine never reads
 *   coordinates, so it never needs trigonometry (decision D-05).
 */

// ---------------------------------------------------------------------------
// Scalars and identifiers
// ---------------------------------------------------------------------------

/** Integer minutes after local midnight. */
export type Minute = number;

export type DonorId = string;
export type PantryId = string;
export type DriverId = string;
export type LotId = string;

/** Evening identifiers from evenings.csv, e.g. "E01" .. "E30". */
export type EveningId = string;

/** The four allocation policies compared on the same evenings (guide page 19). */
export type PolicyId = 'salo' | 'fcfs' | 'nearest' | 'central_greedy';

/** evenings.csv `split`. Tuning and pilot evenings never appear in reported results. */
export type Split = 'tuning' | 'pilot' | 'main_sample';

/** Roles of the four app screens (PRODUCT.md "Roles in v1"). */
export type Role = 'donor' | 'pantry' | 'driver' | 'dashboard';

// ---------------------------------------------------------------------------
// Dataset vocabularies (exact values from the CSV columns)
// ---------------------------------------------------------------------------

export type DonorType =
  | 'karinderya'
  | 'panaderia'
  | 'carinderia-canteen'
  | 'small grocery stall'
  | 'catering kitchen'
  | 'fruit & vegetable stall';

export type PantryType =
  | 'feeding program'
  | 'parish kitchen'
  | 'community pantry'
  | 'barangay kitchen';

/** drivers.csv `vehicle`. Dataset v1.2 has travel times for all four (decision D-Q8). */
export type VehicleKind = 'motorcycle' | 'car' | 'tricycle' | 'bicycle';

export type FoodCategory =
  | 'cooked_dish'
  | 'bread'
  | 'cooked_noodles'
  | 'leafy_greens'
  | 'cooked_vegetables'
  | 'fresh_vegetables'
  | 'cooked_soup'
  | 'cooked_rice'
  | 'fruit'
  | 'packaged_shelf_stable';

export type FoodUnit = 'tray' | 'piece' | 'bilao' | 'kg' | 'loaf' | 'pot' | 'pack' | 'can';

/** drivers.csv / driver_runs.csv outcome vocabulary. A "show" is `completed` or `completed_late`. */
export type RunOutcome = 'completed' | 'no_show' | 'withdrew_after_offer' | 'completed_late';

// ---------------------------------------------------------------------------
// Static world: donors, pantries, drivers, roads
// ---------------------------------------------------------------------------

export interface Donor {
  id: DonorId;
  name: string;
  type: DonorType;
  street: string;
  /** closing_time from donors.csv. A lot cannot be posted after closing (live path). */
  closingMinute: Minute;
  /** Hand-placed row reproducing a study-guide example. */
  anchor: boolean;
}

export interface Pantry {
  id: PantryId;
  name: string;
  type: PantryType;
  street: string;
  opensMinute: Minute;
  closesMinute: Minute;
  hasFridge: boolean;
  fridgeCapacityKg: number;
  dryStorageKg: number;
  anchor: boolean;
}

export interface Driver {
  id: DriverId;
  name: string;
  vehicle: VehicleKind;
  capacityLoadUnits: number;
  street: string;
  availableFromMinute: Minute;
  availableToMinute: Minute;
  /**
   * Tuning counts from drivers.csv (tuning_runs, tuning_shows). These seed the
   * Beta-Bernoulli estimate and are frozen after tuning. Evening-level runs add
   * to them; nothing carries from one evening to the next (decision D-09).
   * reliability = (shows + 1) / (runs + 2), e.g. R. Dizon: (10 + 1) / (11 + 2) = 0.85.
   */
  tuningRuns: number;
  tuningShows: number;
  /**
   * reliability_estimate_frozen from drivers.csv: what the agents believe after tuning. Kept to check the
   * formula in tests. It is NOT the driver's real show rate (that hidden truth lives in hiddenTruth.generated.ts).
   */
  frozenReliability: number;
  anchor: boolean;
}

/**
 * One donor-to-pantry road leg from road_distances.csv. Roads are two-way in the dataset, so the
 * same leg also gives pantry-to-donor (a driver going from one delivery to the next pickup).
 */
export interface RoadLeg {
  donorId: DonorId;
  pantryId: PantryId;
  roadKm: number;
  minutes: Record<VehicleKind, number>;
}

/** driver_distances.csv (v1.2): a driver's home to a donor, in the driver's own vehicle. */
export interface DriverLeg {
  driverId: DriverId;
  donorId: DonorId;
  roadKm: number;
  minutes: number;
}

/** Everything that does not change between evenings. Built once from the bundled dataset. */
export interface World {
  donors: readonly Donor[];
  pantries: readonly Pantry[];
  drivers: readonly Driver[];
  roads: readonly RoadLeg[];
  driverLegs: readonly DriverLeg[];
  /** D-b: minutes late, sampled from the tuning runs' completed_late values. */
  lateMinutes: readonly number[];
}

// ---------------------------------------------------------------------------
// Lots and evenings
// ---------------------------------------------------------------------------

export interface LotItem {
  foodItem: string;
  /** food_item_fil, shown on Filipino-first screens. */
  foodItemFil: string;
  foodCategory: FoodCategory;
  quantity: number;
  unit: FoodUnit;
  estKg: number;
  loadUnits: number;
  /** food_offers.csv needs_fridge_if_kept (FoodKeeper). */
  needsFridgeIfKept: boolean;
  /** storage_rules.csv max_hours_unrefrigerated. An assumption, labelled as such in parameters.csv. */
  maxHoursUnrefrigerated: number;
}

/**
 * A donor's surplus announced to the market. Dataset lots carry exactly one item
 * (food_offers.csv has one row per lot). Live lots may carry several items.
 */
export interface Lot {
  id: LotId;
  donorId: DonorId;
  items: readonly LotItem[];
  /** Sum of item estKg. */
  estKg: number;
  /** Sum of item loadUnits, checked against driver capacity. */
  loadUnits: number;
  postedMinute: Minute;
  /** pickup_by. This is a pickup deadline, not a food-safety expiry (PRODUCT.md, Capabilities). */
  pickupByMinute: Minute;
  origin: 'dataset' | 'live';
}

export interface PantryNeed {
  pantryId: PantryId;
  isOpen: boolean;
  /** Fixed at 16:00 from the seed (pantry_needs.csv need_fixed_at). Never changes during the evening. */
  needKg: number;
}

export interface Evening {
  id: EveningId;
  /** evenings.csv seed. Reduce with `>>> 0` before use as a 32-bit RNG key. */
  seed: number;
  split: Split;
  /** ISO date from evenings.csv. */
  date: string;
  needs: readonly PantryNeed[];
  /** Dataset lots in posting order. */
  lots: readonly Lot[];
}

// ---------------------------------------------------------------------------
// Messages: the six contract-net message types (guide pages 10 and 13)
// ---------------------------------------------------------------------------

export type MessageType =
  | 'CALL_FOR_PROPOSALS'
  | 'PROPOSE'
  | 'REFUSE'
  | 'TENTATIVE_ACCEPT'
  | 'COMMIT'
  | 'FAILURE';

/** The four parts of a pantry's value for a lot. Each in [0, 1]; total is their weighted sum. */
export interface UtilityBreakdown {
  need: number;
  storage: number;
  distance: number;
  freshness: number;
  total: number;
}

/** Why a pantry refuses (the reflex step, guide page 9). */
export type RefuseReason =
  | 'closed_before_earliest_arrival'
  | 'cannot_store_lot'
  | 'no_remaining_need';

/** Why a driver withdraws or a delivery fails. */
export type FailureReason =
  | 'withdrew_before_commit'
  | 'no_show'
  | 'cancelled_by_operator'
  | 'no_commit_before_pickup_deadline';

export type AgentMessage =
  | {
      type: 'CALL_FOR_PROPOSALS';
      lotId: LotId;
      atMinute: Minute;
      /** Round 1 asks pantries; round 2 asks drivers (guide page 10). */
      target: 'pantry' | 'driver';
      from: DonorId;
    }
  | {
      type: 'PROPOSE';
      proposer: 'pantry';
      lotId: LotId;
      atMinute: Minute;
      pantryId: PantryId;
      shares: number;
      utility: UtilityBreakdown;
    }
  | {
      type: 'PROPOSE';
      proposer: 'driver';
      lotId: LotId;
      atMinute: Minute;
      driverId: DriverId;
      etaMinute: Minute;
      reliability: number;
    }
  | {
      type: 'REFUSE';
      lotId: LotId;
      atMinute: Minute;
      pantryId: PantryId;
      reason: RefuseReason;
    }
  | {
      type: 'TENTATIVE_ACCEPT';
      lotId: LotId;
      atMinute: Minute;
      donorId: DonorId;
      pantryId: PantryId;
      shares: number;
    }
  | {
      type: 'COMMIT';
      lotId: LotId;
      atMinute: Minute;
      driverId: DriverId;
      pantryId: PantryId;
      etaMinute: Minute;
    }
  | {
      type: 'FAILURE';
      lotId: LotId;
      atMinute: Minute;
      driverId: DriverId;
      reason: FailureReason;
    };

// ---------------------------------------------------------------------------
// Inputs: things that happen to the evening from outside the agents
// ---------------------------------------------------------------------------

/**
 * Inputs are logged like messages. Replaying the seed, the scenario and the
 * input log reproduces a live run exactly (decision D-06).
 */
export type EngineInput =
  | { type: 'LOT_POSTED'; lot: Lot }
  | { type: 'CANCEL_DRIVER'; lotId: LotId }
  | { type: 'DRIVER_RESPONSE'; driverId: DriverId; lotId: LotId; answer: 'commit' | 'decline' };

/** Tentative and final states of one lot (guide page 13). */
export type AwardState =
  | 'announced'
  | 'tentative'
  | 'final'
  | 'delivered'
  | 'stranded'
  | 'unawarded';

export type EngineEvent =
  | { type: 'MESSAGE'; message: AgentMessage }
  | { type: 'INPUT'; input: EngineInput }
  | { type: 'AWARD_STATE'; lotId: LotId; state: AwardState }
  | {
      type: 'DELIVERY';
      lotId: LotId;
      pantryId: PantryId;
      driverId: DriverId;
      kg: number;
      onTime: boolean;
      minutesLate: number;
    }
  | {
      type: 'RELIABILITY_UPDATED';
      driverId: DriverId;
      shows: number;
      runs: number;
      estimate: number;
    };

/**
 * One row of the event log. The log is the single source for dashboard replay,
 * the message trace and every metric (decision D-04). `seq` is assigned by the
 * engine owner (the dashboard phone) and strictly increases from 1.
 */
export interface LogEntry {
  seq: number;
  evening: EveningId;
  policy: PolicyId;
  atMinute: Minute;
  event: EngineEvent;
}

// ---------------------------------------------------------------------------
// The policy seam: the only place the four policies differ
// ---------------------------------------------------------------------------

/**
 * One pantry the engine considers for a lot, already checked for eligibility.
 * The engine computes these fields; a policy only reads them.
 */
export interface PantryCandidate {
  pantryId: PantryId;
  /** False means the pantry refuses; `refuseReason` says why. */
  eligible: boolean;
  refuseReason: RefuseReason | null;
  utility: UtilityBreakdown;
  roadKm: number;
  /** Minutes to deliver from this donor with the best-available driver's vehicle, or null if none. */
  transportMinutes: Minute | null;
  /**
   * When this pantry replies, from the counter-based RNG keyed on (seed, pantry, lot).
   * Only the first-come-first-served policy reads it (O-4).
   */
  replyMinute: Minute;
}

export interface PantryStageInput {
  atMinute: Minute;
  lot: Lot;
  candidates: readonly PantryCandidate[];
  /** Shares left today per pantry. Empty for the three baselines, which have no budget. */
  remainingShares: ReadonlyMap<PantryId, number>;
}

/** A policy's pantry choice. `shares` is 0 for the three baselines. */
export interface PantryChoice {
  pantryId: PantryId;
  shares: number;
}

/**
 * Every policy implements this. The engine calls `choosePantry` once per lot
 * (round 1). The driver stage (round 2) is shared by all four policies, so the
 * comparison isolates the pantry-selection rule (decision D-07).
 */
export interface AllocationPolicy {
  readonly id: PolicyId;
  choosePantry(input: PantryStageInput): PantryChoice | null;
}

// ---------------------------------------------------------------------------
// Frozen parameters (produced by tuning on tuning evenings only)
// ---------------------------------------------------------------------------

export interface UtilityWeights {
  need: number;
  storage: number;
  distance: number;
  freshness: number;
}

export interface SaloParams {
  utilityWeights: UtilityWeights;
  /** 40 per pantry per evening. Fixed, not tuned (guide page 12). */
  shareBudgetPerEvening: number;
  /**
   * How a value becomes a share bid (decision D-Q2): shares = min(shares left, round(scale x value)).
   * `scale` is tuned on tuning evenings only, then frozen. Only winning bids spend shares (D-Q4).
   */
  shareBid: { kind: 'linear'; scale: number };
}

export interface CentralGreedyParams {
  utilityWeights: UtilityWeights;
  /** Penalty per minute of transport, so the central program is transport-aware. */
  transportPenaltyPerMinute: number;
}

/** Written once after tuning, then never edited. The pilot and main evenings run on these values only. */
export interface FrozenParams {
  schema: 1;
  frozenOn: string;
  tuningEvenings: readonly EveningId[];
  salo: SaloParams;
  centralGreedy: CentralGreedyParams;
}

// ---------------------------------------------------------------------------
// Metrics (guide page 19) and paired comparisons
// ---------------------------------------------------------------------------

export interface EveningResult {
  evening: EveningId;
  policy: PolicyId;
  split: Split;
  /** Per pantry: on-time kg received, capped at seeded need, summed over pantries (guide page 14). */
  foodRescuedKg: number;
  /** Posted kg minus foodRescuedKg (decision D-Q3). Food beyond a pantry's need counts as wasted. */
  foodWastedKg: number;
  /**
   * Min over pantries with need > 0 of min(1, on-time kg / need).
   * Null if no pantry needed anything that evening; such evenings are left out of the fairness average.
   */
  worstNeedMet: number | null;
  strandedAwards: number;
}

/** A paired difference, Salo minus one baseline, over the same evenings. */
export interface PairedDifference {
  metric: 'foodRescuedKg' | 'foodWastedKg' | 'worstNeedMet' | 'strandedAwards';
  baseline: Exclude<PolicyId, 'salo'>;
  meanDiff: number;
  /** 97.5% for the two main results (fixed before the pilot), 95% for the supporting ones. */
  ciLevel: 0.95 | 0.975;
  ciLow: number;
  ciHigh: number;
  evenings: number;
}
