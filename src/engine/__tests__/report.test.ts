/// <reference types="node" />
/// <reference types="jest" />
// Writes docs/reports/m1-tuning-snapshot.md when REPORT=1 (skipped in normal test runs).
// Tuning evenings only: pilot and main evenings are never run before the frozen parameters exist.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVENINGS, WORLD } from '../../data/dataset';
import { UNTUNED_PARAMS } from '../params';
import { POLICY_IDS } from '../policies';
import { runEvening } from '../simulate';
import type { LogEntry } from '../types';
import { indexWorld } from '../world';

const run = process.env.REPORT === '1' ? it : it.skip;
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function line(e: LogEntry): string {
  const ev = e.event;
  if (ev.type === 'MESSAGE') {
    const m = ev.message;
    switch (m.type) {
      case 'CALL_FOR_PROPOSALS': return `CALL_FOR_PROPOSALS ${m.lotId} to ${m.target === 'pantry' ? 'pantries' : 'drivers'}`;
      case 'PROPOSE': return m.proposer === 'pantry'
        ? `PROPOSE ${m.lotId} ${m.pantryId} bids ${m.shares} (value ${m.utility.total.toFixed(2)})`
        : `PROPOSE ${m.lotId} driver ${m.driverId} ETA ${hhmm(m.etaMinute)} reliability ${m.reliability.toFixed(2)}`;
      case 'REFUSE': return `REFUSE ${m.lotId} ${m.pantryId} (${m.reason})`;
      case 'TENTATIVE_ACCEPT': return `TENTATIVE_ACCEPT ${m.lotId} -> ${m.pantryId} (${m.shares} shares)`;
      case 'COMMIT': return `COMMIT ${m.lotId} driver ${m.driverId} -> ${m.pantryId} by ${hhmm(m.etaMinute)}`;
      case 'FAILURE': return `FAILURE ${m.lotId} driver ${m.driverId} (${m.reason})`;
    }
  }
  if (ev.type === 'AWARD_STATE') return `  state ${ev.lotId}: ${ev.state}`;
  if (ev.type === 'DELIVERY') return `DELIVERY ${ev.lotId} ${ev.kg} kg to ${ev.pantryId} by ${ev.driverId}${ev.onTime ? '' : ` LATE (${ev.minutesLate} min)`}`;
  if (ev.type === 'RELIABILITY_UPDATED') return `  reliability ${ev.driverId}: ${ev.shows}/${ev.runs} -> ${ev.estimate.toFixed(2)}`;
  return `INPUT ${ev.input.type}`;
}

run('writes the M1 snapshot', () => {
  const wx = indexWorld(WORLD);
  const tuning = EVENINGS.filter((e) => e.split === 'tuning');
  const out: string[] = ['# M1 snapshot: tuning evenings, UNTUNED parameters', '',
    'Development check only. The parameters are untuned starting values, so these numbers are not results.',
    'Only tuning evenings E01-E10 were run.', ''];
  out.push('| Policy | Food rescued (kg, mean/evening) | Food wasted (kg) | Worst-served need met (mean) | Stranded awards (mean) |', '|---|---|---|---|---|');
  for (const policy of POLICY_IDS) {
    const rs = tuning.map((ev) => runEvening(wx, ev, { policy, params: UNTUNED_PARAMS }).result);
    const mean = (f: (r: (typeof rs)[0]) => number) => (rs.reduce((s, r) => s + f(r), 0) / rs.length);
    out.push(`| ${policy} | ${mean((r) => r.foodRescuedKg).toFixed(1)} | ${mean((r) => r.foodWastedKg).toFixed(1)} | ${mean((r) => r.worstNeedMet ?? 0).toFixed(2)} | ${mean((r) => r.strandedAwards).toFixed(1)} |`);
  }
  let rounds = 0, decided = 0, ties = 0;
  for (const ev of tuning) {
    const s = runEvening(wx, ev, { policy: 'salo', params: UNTUNED_PARAMS }).driverRuleStats;
    rounds += s.rounds; decided += s.decidedByReliability; ties += s.etaTiesBrokenByReliability;
  }
  out.push('', '## Driver rule (D-Q1)', '',
    `On E01-E10 under Salo (${rounds} driver rounds):`, '',
    `- Earliest-ETA rule: reliability broke an ETA tie in ${ties} rounds (${(100 * ties / rounds).toFixed(1)}%). Counted on arrivals rounded to whole minutes (see the caveat below).`,
    `- The most-reliable rule would have picked a different driver in ${decided} rounds (${(100 * decided / rounds).toFixed(1)}%).`, '',
    '**Rounding caveat:** arrivals are rounded up to whole minutes, so most of these ties are rounding ties. With the 1-3 minute driver reply delay (re-measured 2026-10-13, 537 rounds): reliability broke a tie on rounded minutes in 239 rounds (44.5%), on exact arrival times in 72 (13.4%), and within a 1-minute band in 380 (70.8%). Exact ties mean unrounded arrivals within 1e-9 minute. Pre-delay counts (545 rounds): 68 (12.5%) on exact arrivals and 384 (70.5%) within the band. Quote the rounded figure only with these counts (decisions.md, D-Q1 evidence and its re-measure subsection).', '',
    'D-Q1 is final: earliest ETA, reliability breaks ties (decisions.md).', '');
  const ev = tuning[0];
  const { log } = runEvening(wx, ev, { policy: 'salo', params: UNTUNED_PARAMS });
  const first = log.filter((e) => e.event.type === 'MESSAGE' || e.event.type === 'AWARD_STATE' || e.event.type === 'DELIVERY' || e.event.type === 'RELIABILITY_UPDATED')
    .filter((e) => 'lotId' in e.event ? true : e.event.type === 'MESSAGE' ? true : true);
  const lotIds = [...new Set(log.flatMap((e) => (e.event.type === 'MESSAGE' ? [e.event.message.lotId] : [])))].slice(0, 2);
  out.push(`## Replay excerpt: ${ev.id}, Salo, first two lots`, '', '```');
  for (const e of first) {
    const id = e.event.type === 'MESSAGE' ? e.event.message.lotId : 'lotId' in e.event ? e.event.lotId : null;
    if (id && lotIds.includes(id)) out.push(`${hhmm(e.atMinute)}  ${line(e)}`);
  }
  out.push('```', '');
  writeFileSync(join(__dirname, '..', '..', '..', 'docs', 'reports', 'm1-tuning-snapshot.md'), out.join('\n'));
});
