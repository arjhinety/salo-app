import { permissionStateFrom, shouldAskInContext } from '../permission';

describe('permissionStateFrom: expo reports denied while notifications are off, so canAskAgain decides', () => {
  it('granted when the OS granted it', () => {
    expect(permissionStateFrom({ granted: true, canAskAgain: true })).toBe('granted');
  });

  it('undetermined on a phone never asked (Android 13+: notifications off, canAskAgain still true)', () => {
    expect(permissionStateFrom({ granted: false, canAskAgain: true })).toBe('undetermined');
  });

  it('denied once the OS has refused for good', () => {
    expect(permissionStateFrom({ granted: false, canAskAgain: false })).toBe('denied');
  });

  it('a never-asked donor phone with the clock running is asked (the reason shows)', () => {
    const state = permissionStateFrom({ granted: false, canAskAgain: true });
    expect(shouldAskInContext({ role: 'donor', running: true, state, asked: false })).toBe(true);
  });
});
