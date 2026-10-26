/**
 * The bid list for one lot (DSH-03): every pantry's bid, largest share count first under Salo, with the leader's
 * overtaken value struck through and time-stamped, and the refusals with their plain reason. Pure TypeScript.
 * Every input is the visible part of the live log, so nothing after the clock appears.
 */
import { WORLD } from '../data/dataset';
import { dash } from '../i18n/strings';
import type { DonorId, LogEntry, LotId, Minute, PantryId, PolicyId, RefuseReason } from '../engine/types';
import { clock24, shareText, WORLD_NAMES } from './tape';

export interface BidRow {
  key: string;
  kind: 'bid' | 'refused';
  pantryId: PantryId;
  name: string;
  /** The pantry's bid in shares. Null for a refusal, and for a baseline (which has no share budget). */
  shares: number | null;
  /** Salo only: this pantry was the leader and a larger bid overtook it. The value was struck at that minute. */
  remark: { atMinute: Minute; byName: string; struckShares: number } | null;
  hasFridge: boolean;
  /** Road distance from the lot's donor, km. Null when the bundled roads have no leg for the pair. */
  km: number | null;
  /** The pantry's value for the lot, in [0, 1]. Null for a refusal. */
  value: number | null;
  reason: RefuseReason | null;
}

/** What the bid list reads from the world. Injected so the tests can pin every value. */
export interface BidWorld {
  pantryName(id: PantryId): string;
  pantryHasFridge(id: PantryId): boolean;
  roadKm(donorId: DonorId, pantryId: PantryId): number | null;
}

export const BID_WORLD: BidWorld = {
  pantryName: WORLD_NAMES.pantry,
  pantryHasFridge: (id) => WORLD.pantries.find((p) => p.id === id)?.hasFridge ?? false,
  roadKm: (donorId, pantryId) => WORLD.roads.find((r) => r.donorId === donorId && r.pantryId === pantryId)?.roadKm ?? null,
};

interface Bid {
  seq: number;
  atMinute: Minute;
  pantryId: PantryId;
  shares: number;
  value: number;
}

/**
 * The bid rows of one lot. Under Salo a pantry's bid is ranked by shares (largest first, the earlier bid first on a tie).
 * A new bid that is strictly larger than the leader's overtakes it: the leader's value is struck and stamped with the
 * clock minute and the outbidder. Baselines have no shares, so their bids stay in arrival order and nothing is struck.
 * Refusals follow the bids, in the order they came.
 */
export function bidRows(
  log: readonly LogEntry[],
  lot: { id: LotId; donorId: DonorId },
  policy: PolicyId,
  world: BidWorld = BID_WORLD,
): BidRow[] {
  const latest = new Map<PantryId, Bid>();
  const struck = new Map<PantryId, { atMinute: Minute; by: PantryId; struckShares: number }>();
  const refusals: BidRow[] = [];
  let leader: PantryId | null = null;

  for (const { seq, event } of log) {
    if (event.type !== 'MESSAGE' || event.message.lotId !== lot.id) continue;
    const m = event.message;
    if (m.type === 'PROPOSE' && m.proposer === 'pantry') {
      const prior = latest.get(m.pantryId);
      latest.set(m.pantryId, {
        seq: prior?.seq ?? seq,
        atMinute: m.atMinute,
        pantryId: m.pantryId,
        shares: m.shares,
        value: m.utility.total,
      });
      // A pantry's new bid replaces its old one, so an earlier strike on it no longer applies.
      struck.delete(m.pantryId);
      if (policy === 'salo') {
        if (leader === null) leader = m.pantryId;
        else if (leader !== m.pantryId) {
          const lead = latest.get(leader);
          if (lead && m.shares > lead.shares) {
            struck.set(leader, { atMinute: m.atMinute, by: m.pantryId, struckShares: lead.shares });
            leader = m.pantryId;
          }
        }
      }
    } else if (m.type === 'REFUSE') {
      refusals.push({
        key: `r${seq}`,
        kind: 'refused',
        pantryId: m.pantryId,
        name: world.pantryName(m.pantryId),
        shares: null,
        remark: null,
        hasFridge: world.pantryHasFridge(m.pantryId),
        km: world.roadKm(lot.donorId, m.pantryId),
        value: null,
        reason: m.reason,
      });
    }
  }

  const bids = [...latest.values()];
  if (policy === 'salo') bids.sort((a, b) => b.shares - a.shares || a.seq - b.seq);
  else bids.sort((a, b) => a.seq - b.seq);

  const rows: BidRow[] = bids.map((b) => {
    const s = struck.get(b.pantryId);
    return {
      key: `b${b.pantryId}`,
      kind: 'bid',
      pantryId: b.pantryId,
      name: world.pantryName(b.pantryId),
      shares: policy === 'salo' ? b.shares : null,
      remark: s ? { atMinute: s.atMinute, byName: world.pantryName(s.by), struckShares: s.struckShares } : null,
      hasFridge: world.pantryHasFridge(b.pantryId),
      km: world.roadKm(lot.donorId, b.pantryId),
      value: b.value,
      reason: null,
    };
  });
  return [...rows, ...refusals];
}

/** Fridge, distance and value: the facts every bid row carries, in that order. */
function facts(row: BidRow): string[] {
  const out: string[] = [row.hasFridge ? dash.hasFridge : dash.noFridge];
  if (row.km !== null) out.push(dash.km(row.km));
  if (row.value !== null) out.push(dash.valuesAt(row.value.toFixed(2)));
  return out;
}

/** The parts of one row as the dashboard prints them. The component strikes `shares` when `struck` is set. */
export interface BidText {
  name: string;
  /** Shares as printed (Salo only). The struck (old) figure when the bid was overtaken. Null for baselines and refusals. */
  shares: string | null;
  struck: boolean;
  /** Fridge, distance and value. Empty for a refusal. */
  facts: string[];
  /** Set for a refusal: the tag "REFUSED" and the plain reason (PAN-03). */
  refused: { tag: string; reason: string } | null;
  /** Set when the bid was overtaken: "Re-marked at 18:40 when Bukal outbid Socorro". */
  remark: string | null;
}

export function bidText(row: BidRow, policy: PolicyId): BidText {
  if (row.kind === 'refused') {
    return {
      name: row.name,
      shares: null,
      struck: false,
      facts: [],
      refused: { tag: dash.refusedTag, reason: row.reason ? dash.refuse[row.reason] : '' },
      remark: null,
    };
  }
  const salo = policy === 'salo' && row.shares !== null;
  const shown = row.remark ? row.remark.struckShares : row.shares;
  return {
    name: row.name,
    shares: salo && shown !== null ? shareText(shown) : null,
    struck: salo && row.remark !== null,
    facts: facts(row),
    refused: null,
    remark: row.remark ? dash.remarkAt(clock24(row.remark.atMinute), row.remark.byName, row.name) : null,
  };
}

/** The spoken label of one row. TalkBack reads a struck value as "was N shares" (CC-08). */
export function bidSpoken(row: BidRow, policy: PolicyId): string {
  const t = bidText(row, policy);
  if (t.refused) return [t.name, t.refused.tag, t.refused.reason].join('. ');
  const parts = [t.name];
  if (t.shares !== null) parts.push(t.struck ? dash.wasShares(t.shares) : dash.sharesCount(t.shares));
  parts.push(...t.facts);
  if (t.remark) parts.push(t.remark);
  return parts.join('. ');
}
