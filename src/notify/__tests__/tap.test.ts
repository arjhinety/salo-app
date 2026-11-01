/**
 * Tap routing, delivery payload and the permission decision (CC-12). expo-notifications is mocked: no native code runs.
 */
import * as Notifications from 'expo-notifications';
import { attachTapRouting, hrefFromData, openLastTap } from '../tap';
import { announce, installHandler } from '../deliver';
import { shouldAskInContext } from '../permission';
import type { NotifyEvent } from '../events';

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponse: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'id-1'),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  AndroidImportance: { DEFAULT: 3 },
}));

const mocked = Notifications as unknown as {
  addNotificationResponseReceivedListener: jest.Mock;
  getLastNotificationResponse: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
};

const response = (id: string, data: unknown) => ({
  notification: { request: { identifier: id, content: { data } } },
});

describe('foreground and background presentation', () => {
  it('installs a handler that shows the banner and the list entry, so scheduled notifications appear', async () => {
    const set = (Notifications as unknown as { setNotificationHandler: jest.Mock }).setNotificationHandler;
    installHandler();
    expect(set).toHaveBeenCalledTimes(1);
    const behavior = await set.mock.calls[0][0].handleNotification({});
    expect(behavior).toEqual({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false });
  });
});

describe('tap routing', () => {
  it('opens the donor, driver and pantry lot screens', () => {
    expect(hrefFromData({ href: '/donor' })).toBe('/donor');
    expect(hrefFromData({ href: '/driver' })).toBe('/driver');
    expect(hrefFromData({ href: '/pantry/lot/L0227?profile=P19' })).toBe('/pantry/lot/L0227?profile=P19');
  });

  it('ignores any other destination, a missing href, and a non-object payload', () => {
    expect(hrefFromData({ href: 'https://example.com' })).toBeNull();
    expect(hrefFromData({ href: '/dashboard' })).toBeNull();
    expect(hrefFromData({ href: '/pantry/lot/L0227' })).toBeNull();
    expect(hrefFromData({})).toBeNull();
    expect(hrefFromData(null)).toBeNull();
    expect(hrefFromData('/donor')).toBeNull();
  });

  it('a tap while mounted opens its destination; the cleanup removes the listener', () => {
    const remove = jest.fn();
    let listener: ((r: unknown) => void) | undefined;
    mocked.addNotificationResponseReceivedListener.mockImplementation((fn) => {
      listener = fn;
      return { remove };
    });
    const open = jest.fn();
    const detach = attachTapRouting(open);
    listener!(response('a', { href: '/donor' }));
    listener!(response('b', { href: '/nope' }));
    expect(open.mock.calls).toEqual([['/donor']]);
    detach();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('a cold start opens the tap that started the app once per identifier', () => {
    mocked.getLastNotificationResponse.mockReturnValue(response('cold-1', { href: '/driver' }));
    const open = jest.fn();
    const handled = new Set<string>();
    openLastTap(open, handled);
    openLastTap(open, handled);
    expect(open.mock.calls).toEqual([['/driver']]);
  });

  it('no tap at start: nothing opens', () => {
    mocked.getLastNotificationResponse.mockReturnValue(null);
    const open = jest.fn();
    openLastTap(open, new Set());
    expect(open).not.toHaveBeenCalled();
  });
});

describe('delivery payload', () => {
  it('shows the event on the salo channel with its destination in the data', async () => {
    const event: NotifyEvent = {
      key: 'k',
      kind: 'pantry_final',
      lotId: 'L0227',
      atMinute: 1032,
      title: 'T',
      body: 'B',
      href: '/pantry/lot/L0227?profile=P19',
    };
    await announce(event);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: { title: 'T', body: 'B', data: { href: '/pantry/lot/L0227?profile=P19', kind: 'pantry_final', lotId: 'L0227' } },
      trigger: { channelId: 'salo-live' },
    });
  });
});

describe('permission is asked once, in context, on an eligible phone while the evening runs', () => {
  const base = { role: 'donor' as const, running: true, state: 'undetermined' as const, asked: false };

  it('asks on a donor, pantry or driver phone when the clock runs and the OS has not decided', () => {
    expect(shouldAskInContext(base)).toBe(true);
    expect(shouldAskInContext({ ...base, role: 'pantry' })).toBe(true);
    expect(shouldAskInContext({ ...base, role: 'driver' })).toBe(true);
  });

  it('never on the dashboard, with no role, before the clock runs, after it was asked, or once decided', () => {
    expect(shouldAskInContext({ ...base, role: 'dashboard' })).toBe(false);
    expect(shouldAskInContext({ ...base, role: null })).toBe(false);
    expect(shouldAskInContext({ ...base, running: false })).toBe(false);
    expect(shouldAskInContext({ ...base, asked: true })).toBe(false);
    expect(shouldAskInContext({ ...base, asked: null })).toBe(false);
    expect(shouldAskInContext({ ...base, state: 'granted' })).toBe(false);
    expect(shouldAskInContext({ ...base, state: 'denied' })).toBe(false);
  });
});
