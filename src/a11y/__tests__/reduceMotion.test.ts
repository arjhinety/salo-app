import { watchReduceMotion, type MotionSource } from '../reduceMotion';

/** A stand-in for AccessibilityInfo: the test controls the first answer and fires change events by hand. */
function fakeSource(first: Promise<boolean>) {
  const handlers: ((enabled: boolean) => void)[] = [];
  const state = { listening: 0, removed: 0 };
  const source: MotionSource = {
    isReduceMotionEnabled: () => first,
    addEventListener(event, handler) {
      expect(event).toBe('reduceMotionChanged');
      state.listening++;
      handlers.push(handler);
      return {
        remove() {
          state.removed++;
          handlers.splice(handlers.indexOf(handler), 1);
        },
      };
    },
  };
  return {
    source,
    state,
    emit: (enabled: boolean) => handlers.slice().forEach((h) => h(enabled)),
  };
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('watchReduceMotion', () => {
  it('reports the OS setting it starts with', async () => {
    const f = fakeSource(Promise.resolve(true));
    const seen: boolean[] = [];
    watchReduceMotion(f.source, (on) => seen.push(on));
    await settle();
    expect(seen).toEqual([true]);
  });

  it('follows later change events, both on and off', async () => {
    const f = fakeSource(Promise.resolve(false));
    const seen: boolean[] = [];
    watchReduceMotion(f.source, (on) => seen.push(on));
    await settle();
    f.emit(true);
    f.emit(false);
    expect(seen).toEqual([false, true, false]);
  });

  it('ignores a first answer that arrives after a change event (the older value is stale)', async () => {
    let resolveFirst: (v: boolean) => void = () => {};
    const f = fakeSource(new Promise<boolean>((r) => (resolveFirst = r)));
    const seen: boolean[] = [];
    watchReduceMotion(f.source, (on) => seen.push(on));
    f.emit(true);
    resolveFirst(false);
    await settle();
    expect(seen).toEqual([true]);
  });

  it('keeps motion on when the query fails', async () => {
    const f = fakeSource(Promise.reject(new Error('no accessibility service')));
    const seen: boolean[] = [];
    watchReduceMotion(f.source, (on) => seen.push(on));
    await settle();
    expect(seen).toEqual([]);
  });

  it('unsubscribes: removes the listener and drops later events and a late first answer', async () => {
    let resolveFirst: (v: boolean) => void = () => {};
    const f = fakeSource(new Promise<boolean>((r) => (resolveFirst = r)));
    const seen: boolean[] = [];
    const stop = watchReduceMotion(f.source, (on) => seen.push(on));
    stop();
    expect(f.state.removed).toBe(1);
    f.emit(true);
    resolveFirst(true);
    await settle();
    expect(seen).toEqual([]);
  });
});
