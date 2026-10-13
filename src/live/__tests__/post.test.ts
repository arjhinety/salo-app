import { lotDrafts, submitLots, type DraftItem, type PostGuard } from '../../donor/postForm';
import { LiveEvening } from '../evening';

// Two cards from the manual form: pork adobo 3 trays and pandesal 20 pieces, posted at 17:05 for a 18:00 pickup.
const POST_MINUTE = 17 * 60 + 5; // 1025
const PICKUP = 18 * 60; // 1080

const CARDS: DraftItem[] = [
  { foodItem: 'pork adobo', unit: 'tray', quantity: 3 },
  { foodItem: 'pandesal', unit: 'piece', quantity: 20 },
];

describe('posting two cards into the live evening', () => {
  test('nextLiveIds previews the ids the next posts will get, without posting', () => {
    const live = new LiveEvening({ startMinute: POST_MINUTE });
    expect(live.nextLiveIds(2)).toEqual(['LIVE-1', 'LIVE-2']);
    expect(live.nextLiveIds(0)).toEqual([]);
    expect(live.postedLots().some((l) => l.origin === 'live')).toBe(false);
  });

  test('creates LIVE-1 and LIVE-2, one item each, at the post minute with the chosen pickup', () => {
    const live = new LiveEvening({ startMinute: POST_MINUTE });
    const result = submitLots(live, lotDrafts(CARDS, 'D01', PICKUP), { posted: false });

    expect(result.status).toBe('posted');
    const lots = live.postedLots().filter((l) => l.origin === 'live');
    expect(lots.map((l) => l.id)).toEqual(['LIVE-1', 'LIVE-2']);
    expect(lots.map((l) => l.items.length)).toEqual([1, 1]);
    expect(lots.every((l) => l.postedMinute === POST_MINUTE && l.pickupByMinute === PICKUP)).toBe(true);
    expect(lots.map((l) => l.estKg)).toEqual([6, 0.6]);
  });

  test('the engine log gets one CALL_FOR_PROPOSALS per lot, at the post minute', () => {
    const live = new LiveEvening({ startMinute: POST_MINUTE });
    submitLots(live, lotDrafts(CARDS, 'D01', PICKUP), { posted: false });

    const cfps = live
      .visibleLog()
      .map((e) => e.event)
      .flatMap((ev) => (ev.type === 'MESSAGE' && ev.message.type === 'CALL_FOR_PROPOSALS' ? [ev.message] : []));
    for (const id of ['LIVE-1', 'LIVE-2']) {
      const mine = cfps.filter((m) => m.lotId === id);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ atMinute: POST_MINUTE, from: 'D01', target: 'pantry' });
    }
  });

  test('the D01 donor lot views include both new lots', () => {
    const live = new LiveEvening({ startMinute: POST_MINUTE });
    submitLots(live, lotDrafts(CARDS, 'D01', PICKUP), { posted: false });

    const ids = live.lotViews('D01').map((v) => v.lot.id);
    expect(ids).toEqual(expect.arrayContaining(['LIVE-1', 'LIVE-2']));
    expect(live.lotViews('D02').map((v) => v.lot.id)).not.toEqual(expect.arrayContaining(['LIVE-1']));
  });

  test('a second submit with the same guard posts nothing new', () => {
    const live = new LiveEvening({ startMinute: POST_MINUTE });
    const guard: PostGuard = { posted: false };
    submitLots(live, lotDrafts(CARDS, 'D01', PICKUP), guard);
    submitLots(live, lotDrafts(CARDS, 'D01', PICKUP), guard);
    expect(live.nextLiveIds(1)).toEqual(['LIVE-3']);
  });
});
