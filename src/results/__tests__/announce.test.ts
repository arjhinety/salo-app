/// <reference types="jest" />
// Run states a11y: TalkBack hears phase changes and every tenth evening, not each of the 44 progress updates.

import { ANNOUNCE_EVERY, announcementOf, progressLine, type RunView } from '../announce';
import { RESULTS_COPY as C } from '../copy';

const running = (done: number, total = 44): RunView => ({ status: 'running', phase: 'evenings', done, total });

describe('announcementOf: the live announcer speaks only on phase changes and every tenth evening', () => {
  test('the start, then evenings 10, 20, 30 and 40 of 44, then the intervals: six announcements for a whole run', () => {
    const spoken: string[] = [];
    for (let done = 0; done <= 44; done++) {
      const a = announcementOf(running(done));
      if (a !== '') spoken.push(a);
    }
    const intervals = announcementOf({ status: 'running', phase: 'intervals', done: 44, total: 44 });
    expect(spoken).toEqual([C.runStarted, C.runProgress(10, 44), C.runProgress(20, 44), C.runProgress(30, 44), C.runProgress(40, 44)]);
    expect(intervals).toBe(C.runIntervals);
  });

  test('no announcement for the evenings in between', () => {
    for (const done of [1, 5, 9, 11, 19, 21, 43]) expect(announcementOf(running(done))).toBe('');
  });

  test('every tenth evening is the rule, and the step is named once', () => {
    expect(ANNOUNCE_EVERY).toBe(10);
    expect(announcementOf(running(10))).toBe('Evening 10 of 44 …');
  });

  test('nothing is spoken while the run is not running', () => {
    expect(announcementOf({ status: 'idle' })).toBe('');
    expect(announcementOf({ status: 'cancelled' })).toBe('');
    expect(announcementOf({ status: 'failed' })).toBe('');
  });
});

describe('progressLine: the visible line updates every evening, the spoken one does not', () => {
  test('the evening line, and the intervals line once every evening is done', () => {
    expect(progressLine({ phase: 'evenings', done: 12, total: 44 })).toBe('Evening 12 of 44 …');
    expect(progressLine({ phase: 'intervals', done: 44, total: 44 })).toBe(C.runIntervals);
  });
});
