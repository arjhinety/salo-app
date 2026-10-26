import { SYNC } from '../sync';
import { DRV } from '../driver';
import { PANTRY_COPY, type WhyFill } from '../pantry';

describe('copy fixes (apply exactly)', () => {
  test('sync: the Filipino lines are the new wording, English subtitles kept', () => {
    expect(SYNC.join.title).toBe('Sumali sa sesyon ngayong gabi · Join an evening');
    expect(SYNC.state.offlineHint.split(' · ')[0]).toBe('Nananatili sa screen ang huling estado. Maa-update ito kapag bumalik ang koneksyon.');
    expect(SYNC.state.stale.split(' · ')[0]).toBe('Matagal nang walang update sa oras mula sa dashboard');
    expect(SYNC.state.watchOnly.split(' · ')[0]).toBe('Nanonood ka lang: sumali ka matapos magsimula ang sesyon');
  });

  test('driver: the English line of the requests empty hint', () => {
    expect(DRV.requestsEmptyHint.split(' · ')[1]).toBe('Requests appear here as the simulated clock moves');
  });

  test('pantry outbid line says Natitirang shares, like the won line', () => {
    const f: WhyFill = { name: 'Bukal', shares: '9', total: '0.61', need: '0.20', storage: '0.10', distance: '0.10', freshness: '0.10', left: '5', km: '1.1' };
    expect(PANTRY_COPY.whyLine.outbid(f).split(' · ')[0]).toContain('Natitirang shares: 5.');
    expect(PANTRY_COPY.whyLine.outbid(f)).not.toContain('Natira ngayon');
    expect(PANTRY_COPY.whyLine.won(f)).toContain('Natitirang shares:');
  });
});
