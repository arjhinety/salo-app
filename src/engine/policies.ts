import type { AllocationPolicy, PantryCandidate, PantryChoice, PantryStageInput, PolicyId } from './types';

const byId = (a: PantryCandidate, b: PantryCandidate) => (a.pantryId < b.pantryId ? -1 : 1);

function pick(
  input: PantryStageInput,
  better: (a: PantryCandidate, b: PantryCandidate) => number,
  shares: (c: PantryCandidate) => number = () => 0,
): PantryChoice | null {
  const ok = input.candidates.filter((c) => c.eligible);
  if (!ok.length) return null;
  const best = [...ok].sort((a, b) => better(a, b) || byId(a, b))[0];
  return { pantryId: best.pantryId, shares: shares(best) };
}

/** Salo (contract net): highest share bid; ties go to higher value, then lower pantry id (D-Q2, D-Q4). */
export function saloPolicy(bidOf: (c: PantryCandidate) => number): AllocationPolicy {
  return {
    id: 'salo',
    choosePantry: (input) =>
      pick(input, (a, b) => bidOf(b) - bidOf(a) || b.utility.total - a.utility.total, bidOf),
  };
}

/** First come, first served: whoever replies first (decision D-a). */
export const fcfsPolicy: AllocationPolicy = {
  id: 'fcfs',
  choosePantry: (input) => pick(input, (a, b) => a.replyMinute - b.replyMinute),
};

/** Nearest pantry by road. */
export const nearestPolicy: AllocationPolicy = {
  id: 'nearest',
  choosePantry: (input) => pick(input, (a, b) => a.roadKm - b.roadKm),
};

/** Central greedy: highest value minus a transport penalty (its own tuned weights; guide page 19). */
export function centralGreedyPolicy(
  valueOf: (c: PantryCandidate) => number,
  penaltyPerMinute: number,
): AllocationPolicy {
  const score = (c: PantryCandidate) => valueOf(c) - penaltyPerMinute * (c.transportMinutes ?? 1e9);
  return { id: 'central_greedy', choosePantry: (input) => pick(input, (a, b) => score(b) - score(a)) };
}

export const POLICY_IDS: readonly PolicyId[] = ['salo', 'fcfs', 'nearest', 'central_greedy'];
