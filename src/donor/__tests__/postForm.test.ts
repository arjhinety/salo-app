import { findEntry } from '../catalog';
import { lotDrafts, pickupChoices, submitLots, type DraftItem, type PostGuard } from '../postForm';
import { hhmm } from '../tonight';
import { LiveEvening } from '../../live/evening';
import { S } from '../../i18n/strings';

const clock = (h: number, m: number) => h * 60 + m;

describe('pickup chips', () => {
  test('clock 17:05: +45, +60, +75, +90 round to 17:45, 18:00, 18:15, 18:30', () => {
    expect(pickupChoices(clock(17, 5))).toEqual([clock(17, 45), clock(18, 0), clock(18, 15), clock(18, 30)]);
    expect(pickupChoices(clock(17, 5)).map(hhmm)).toEqual(['5:45 PM', '6:00 PM', '6:15 PM', '6:30 PM']);
  });

  test('clock 20:30: every candidate caps at 21:00, so one 9:00 PM chip is offered', () => {
    expect(pickupChoices(clock(20, 30))).toEqual([clock(21, 0)]);
    expect(pickupChoices(clock(20, 30)).map(hhmm)).toEqual(['9:00 PM']);
  });

  test('clock 20:50: still one 9:00 PM chip', () => {
    expect(pickupChoices(clock(20, 50))).toEqual([clock(21, 0)]);
  });

  test('clock 20:15: +45 rounds to 21:00, and the later offsets cap there too, so the list de-duplicates to one chip', () => {
    expect(pickupChoices(clock(20, 15))).toEqual([clock(21, 0)]);
  });

  test('clock 21:00: nothing is after the clock and at most 21:00, so the list is empty', () => {
    expect(pickupChoices(clock(21, 0))).toEqual([]);
  });

  test('every chip is after the clock, at most 21:00, a multiple of 15 minutes, and unique', () => {
    for (let m = clock(17, 0); m <= clock(21, 30); m++) {
      const chips = pickupChoices(m);
      expect(new Set(chips).size).toBe(chips.length);
      for (const t of chips) {
        expect(t).toBeGreaterThan(m);
        expect(t).toBeLessThanOrEqual(clock(21, 0));
        expect(t % 15).toBe(0);
      }
    }
  });

  test('the chip label is "Kunin bago 7:30 PM" for 19:30', () => {
    expect(S.postForm.pickupChip(hhmm(clock(19, 30)))).toBe('Kunin bago 7:30 PM');
  });
});

describe('copy', () => {
  test('"expiry" appears only inside the negated pickup note (DON-03)', () => {
    const all: string[] = [];
    const f = S.postForm;
    all.push(f.heading, f.hint, f.fromBefore, f.others, f.addA11y('adobong baboy', 'pork adobo'), f.full, f.noItems);
    all.push(f.amount, f.decreaseA11y('a', 'b'), f.increaseA11y('a', 'b'), f.amountSaid(3, 'tray', 'tray'), f.kg(6));
    all.push(f.storage, f.fridge, f.noFridge, f.removeA11y('a', 'b'), f.pickupLabel, f.pickupChip('7:30 PM'));
    all.push(f.pickupNote, f.pickupClosed, f.becomes(['LIVE-1', 'LIVE-2']), f.post, f.pickFirst, f.problems);
    const hits = all.filter((s) => /expir|best before/i.test(s));
    expect(hits).toEqual([f.pickupNote]);
    expect(f.pickupNote).toContain('hindi expiry');
  });

  test('"becomes" names one lot', () => {
    expect(S.postForm.becomes(['LIVE-1'])).toBe('Ito ang magiging lot ID: LIVE-1. · This will be lot LIVE-1.');
  });

  test('"becomes" names two lots', () => {
    expect(S.postForm.becomes(['LIVE-1', 'LIVE-2'])).toBe(
      'Ito ang mga magiging lot ID: LIVE-1 at LIVE-2. · These will be lots LIVE-1 and LIVE-2.',
    );
  });

  test('"becomes" names three lots', () => {
    expect(S.postForm.becomes(['LIVE-1', 'LIVE-2', 'LIVE-3'])).toBe(
      'Ito ang mga magiging lot ID: LIVE-1, LIVE-2 at LIVE-3. · These will be lots LIVE-1, LIVE-2 and LIVE-3.',
    );
  });

  test('the heading reads "O pumili rito · Or pick here"', () => {
    expect(S.postForm.heading).toBe('O pumili rito · Or pick here');
  });
});

describe('lot drafts from the form', () => {
  const adobo: DraftItem = { foodItem: 'pork adobo', unit: 'tray', quantity: 3 };
  const pandesal: DraftItem = { foodItem: 'pandesal', unit: 'piece', quantity: 20 };

  test('one draft per card, each with one item, the donor, and the chosen pickup', () => {
    const drafts = lotDrafts([adobo, pandesal], 'D01', clock(19, 0));
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.items.length)).toEqual([1, 1]);
    expect(drafts.every((d) => d.donorId === 'D01' && d.pickupByMinute === 1140)).toBe(true);
    expect(drafts[0].items[0]).toMatchObject({ quantity: 3, unit: 'tray', estKg: 6, loadUnits: 3, needsFridgeIfKept: true });
    expect(drafts[1].items[0]).toMatchObject({ quantity: 20, unit: 'piece', estKg: 0.6, loadUnits: 1, needsFridgeIfKept: false });
  });

  test('an item the catalog does not know is skipped', () => {
    expect(lotDrafts([{ foodItem: 'not a food', unit: 'tray', quantity: 1 }], 'D01', clock(19, 0))).toEqual([]);
    expect(findEntry('not a food', 'tray')).toBeUndefined();
  });
});

describe('submitLots: double-tap guard', () => {
  test('calling submit twice quickly posts the cards once', () => {
    const live = new LiveEvening({ startMinute: clock(17, 5) });
    const drafts = lotDrafts(
      [
        { foodItem: 'pork adobo', unit: 'tray', quantity: 3 },
        { foodItem: 'pandesal', unit: 'piece', quantity: 20 },
      ],
      'D01',
      clock(18, 0),
    );
    const guard: PostGuard = { posted: false };

    const first = submitLots(live, drafts, guard);
    const second = submitLots(live, drafts, guard);

    expect(first.status).toBe('posted');
    expect(second.status).toBe('busy');
    const posted = live.postedLots().filter((l) => l.origin === 'live');
    expect(posted.map((l) => l.id)).toEqual(['LIVE-1', 'LIVE-2']);
  });

  test('a failed post leaves the guard open, so the donor can fix the time and try again', () => {
    const live = new LiveEvening({ startMinute: clock(20, 30) });
    const drafts = lotDrafts([{ foodItem: 'pandesal', unit: 'piece', quantity: 20 }], 'D01', clock(20, 15));
    const guard: PostGuard = { posted: false };

    const result = submitLots(live, drafts, guard);

    expect(result.status).toBe('problems');
    expect(guard.posted).toBe(false);
    expect(live.postedLots().some((l) => l.origin === 'live')).toBe(false);
  });

  test('no drafts posts nothing', () => {
    const live = new LiveEvening({ startMinute: clock(17, 5) });
    expect(submitLots(live, [], { posted: false }).status).toBe('empty');
  });
});
