import { SYNC } from '../sync';
import { DRV } from '../driver';
import { S } from '../strings';
import { PANTRY_COPY, type WhyFill } from '../pantry';

describe('copy fixes (apply exactly)', () => {
  test('sync: the Filipino lines are the new wording, English subtitles kept', () => {
    expect(SYNC.join.title).toBe('Sumali sa sesyon ngayong gabi · Join an evening');
    expect(SYNC.state.offlineHint.split(' · ')[0]).toBe('Nananatili sa screen ang huling estado. Maa-update ito kapag bumalik ang koneksyon.');
    expect(SYNC.state.stale.split(' · ')[0]).toBe('Matagal nang walang update sa oras mula sa dashboard');
    expect(SYNC.state.watchOnly.split(' · ')[0]).toBe('Nanonood ka lang: sumali ka matapos magsimula ang sesyon');
  });

  test('driver: the English line of the requests empty hint, with its full stop', () => {
    expect(DRV.requestsEmptyHint.split(' · ')[1]).toBe('Requests appear here as the simulated clock moves.');
  });

  test('driver: the hint lines that now read Small end in a full stop, Filipino and English', () => {
    for (const s of [DRV.simNote, DRV.chooserHint, DRV.chooserLocked, DRV.requestsEmptyHint]) {
      const [fil, en] = s.split(' · ');
      expect(fil.endsWith('.')).toBe(true);
      expect(en.endsWith('.')).toBe(true);
    }
    expect(DRV.chooserHint).toBe(
      'Pumili ng tagahatid na tatanggap ng mga request. Ikaw ang gaganap bilang napili mo. · Choose a driver who gets requests. You hold the one you choose.',
    );
  });

  test('donor: the empty-state hint has an English half, and the question is a Filipino line with English after " · "', () => {
    expect(S.emptyTonight.hint.split(' · ')).toHaveLength(2);
    expect(S.postScreen.question.split(' · ')).toEqual(['Ano ang natira?', 'What is left?']);
    expect(S.postScreen.example.split(' · ')).toHaveLength(2);
  });

  test('the join example code reads "Hal. ABC123 · e.g. ABC123" and is one bilingual pair', () => {
    expect(SYNC.join.placeholder).toBe('Hal. ABC123 · e.g. ABC123');
  });

  test('pantry outbid line says Natitirang shares, like the won line', () => {
    const f: WhyFill = { name: 'Bukal', shares: '9', total: '0.61', need: '0.20', storage: '0.10', distance: '0.10', freshness: '0.10', left: '5', km: '1.1' };
    expect(PANTRY_COPY.whyLine.outbid(f).split(' · ')[0]).toContain('Natitirang shares: 5.');
    expect(PANTRY_COPY.whyLine.outbid(f)).not.toContain('Natira ngayon');
    expect(PANTRY_COPY.whyLine.won(f)).toContain('Natitirang shares:');
  });
});
