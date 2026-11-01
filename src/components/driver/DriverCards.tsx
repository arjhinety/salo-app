import * as WebBrowser from 'expo-web-browser';
import { Linking, Pressable, StyleSheet, View, Text } from 'react-native';
import { hhmm } from '../../donor/tonight';
import { DRV, splitBi } from '../../i18n/driver';
import { S } from '../../i18n/strings';
import type { Driver, Donor, Pantry } from '../../engine/types';
import { HUMAN_REPLY_WINDOW_MIN } from '../../engine/params';
import { directionsUrl } from '../../driver/maps';
import { donorPosition, pantryPosition } from '../../data/places';
import type { Ask, Trip } from '../../driver/board';
import { useTheme } from '../../theme/theme';
import { SPACE, TYPE } from '../../theme/tokens';
import { Sticker, type StickerKind } from '../Sticker';

/**
 * A bilingual line: Filipino large, English beneath (CC-05). TalkBack reads both, in order. `surface` picks the ink:
 * text on a kraft tag, or text on the tarp's ground (light or night canopy).
 */
export function Bi({
  text,
  strong = false,
  tone = 'ink',
  surface = 'kraft',
}: {
  text: string;
  strong?: boolean;
  tone?: 'ink' | 'muted';
  surface?: 'kraft' | 'ground';
}) {
  const { c } = useTheme();
  const { fil, en } = splitBi(text);
  const ink = surface === 'kraft' ? c.onKraft : c.text;
  const muted = surface === 'kraft' ? c.onKraftMuted : c.textMuted;
  return (
    <View accessible={false}>
      <Text style={[strong ? TYPE.bodyStrong : TYPE.body, { color: tone === 'muted' ? muted : ink }]}>{fil}</Text>
      {en ? <Text style={[TYPE.small, { color: muted }]}>{en}</Text> : null}
    </View>
  );
}

/** The spoken form of a bilingual string: the separator becomes a pause. */
export const spoken = (text: string) => text.replace(' · ', '. ');

/** Text for the lot's items: "3 tray adobo, 1 kaldero sabaw". */
export function itemsText(ask: Ask): string {
  return ask.lot.items.map((i) => `${i.quantity} ${S.units[i.unit]} ${i.foodItemFil}`).join(', ');
}

export function lotLabel(lotId: string): string {
  const m = /^L0*(\d+)$/.exec(lotId);
  return DRV.lot(m ? m[1] : lotId);
}

export function Button({
  label,
  onPress,
  primary = false,
  alert = false,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  alert?: boolean;
  accessibilityHint?: string;
}) {
  const { c } = useTheme();
  const { fil, en } = splitBi(label);
  const ink = primary ? c.onTarp : alert ? c.onKraftAlert : c.onKraft;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken(label)}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? c.tarp : 'transparent',
          borderColor: primary ? c.tarp : ink,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text style={[TYPE.bodyStrong, { color: ink, textAlign: 'center' }]}>{fil}</Text>
      {en ? <Text style={[TYPE.small, { color: ink, textAlign: 'center' }]}>{en}</Text> : null}
    </Pressable>
  );
}

/** A request on a kraft tag: the pickup, the drop-off, the deadline and the reply window. */
export function RequestCard({
  ask,
  now,
  donor,
  pantry,
  offer,
  onOffer,
  onDecline,
}: {
  ask: Ask;
  now: number;
  donor: Donor;
  pantry: Pantry;
  offer: Trip | null;
  onOffer: () => void;
  onDecline: () => void;
}) {
  const { c } = useTheme();
  const before = hhmm(ask.lot.pickupByMinute);
  const left = Math.max(1, ask.closesMinute - now);
  // The facts of the request, read as one sentence. The buttons below stay separate, so they can still be reached.
  const requestSpoken = [
    lotLabel(ask.lot.id),
    itemsText(ask),
    `${spoken(DRV.pickupFrom)}: ${donor.name}, ${donor.street}`,
    `${spoken(DRV.dropoffAt)}: ${pantry.name}, ${pantry.street}`,
    spoken(DRV.before(before)),
    spoken(DRV.window(left)),
  ].join('. ');
  return (
    <View style={[styles.tag, { backgroundColor: c.kraft, borderColor: c.kraftEdge }]}>
      <View accessible accessibilityLabel={requestSpoken} style={styles.info}>
      <View style={styles.row}>
        <Sticker text={DRV.stickerRequest} kind="live" />
        <Text style={[TYPE.label, { color: c.onKraftMuted }]}>{lotLabel(ask.lot.id).toUpperCase()}</Text>
      </View>
      <Text style={[TYPE.item, { color: c.marker }]} accessibilityRole="header">
        {itemsText(ask)}
      </Text>
      <View style={[styles.rule, { backgroundColor: c.kraftEdge }]} />
      <Slot label={DRV.pickupFrom} value={`${donor.name}, ${donor.street}`} />
      <Slot label={DRV.dropoffAt} value={`${pantry.name}, ${pantry.street}`} />
      <Bi text={DRV.before(before)} strong />
      <Bi text={DRV.window(left)} tone="muted" />
      </View>
      {offer ? (
        <View style={styles.actions}>
          <Button label={DRV.offer} primary onPress={onOffer} accessibilityHint={spoken(DRV.offered(hhmm(offer.arrive)))} />
          <Button label={DRV.decline} onPress={onDecline} />
        </View>
      ) : (
        <>
          <Bi text={DRV.offerNo} tone="muted" />
          <View style={styles.actions}>
            <Button label={DRV.decline} onPress={onDecline} />
          </View>
        </>
      )}
    </View>
  );
}

/** A run or an offer on the driver's list: the state on a sticker, the steps as the clock reaches them, the actions. */
export function RunCard({
  ask,
  now,
  donor,
  pantry,
  onCommit,
  onWithdraw,
  onMaps,
}: {
  ask: Ask;
  now: number;
  donor: Donor;
  pantry: Pantry;
  onCommit: () => void;
  onWithdraw: () => void;
  onMaps: () => void;
}) {
  const { c } = useTheme();
  const sticker = stickerOf(ask.status);
  const before = hhmm(ask.lot.pickupByMinute);
  const pickedUpAt = ask.commitMinute === null || ask.pickupMinute === null ? null : Math.max(ask.pickupMinute, ask.commitMinute);
  const pickedUpShown = pickedUpAt !== null && pickedUpAt <= now;
  const left = Math.max(1, ask.statusMinute + HUMAN_REPLY_WINDOW_MIN - now);
  const showRoute = ask.status === 'committed' || ask.status === 'delivered';
  return (
    <View style={[styles.tag, { backgroundColor: c.kraft, borderColor: c.kraftEdge }]}>
      <View style={styles.row}>
        <Sticker text={sticker.text} kind={sticker.kind} live />
        <Text style={[TYPE.label, { color: c.onKraftMuted }]}>{lotLabel(ask.lot.id).toUpperCase()}</Text>
      </View>
      <Text style={[TYPE.item, { color: c.marker }]} accessibilityRole="header">
        {itemsText(ask)}
      </Text>
      <View style={[styles.rule, { backgroundColor: c.kraftEdge }]} />
      {ask.status === 'committed' || ask.status === 'delivered' ? (
        <Bi text={DRV.committed(before)} strong />
      ) : null}
      {ask.status === 'picked' ? <Bi text={DRV.picked(left)} strong /> : null}
      {ask.status === 'not_picked' ? (
        <>
          <Bi text={DRV.notPicked} strong />
          <Bi text={DRV.notPickedHint} tone="muted" />
        </>
      ) : null}
      {ask.status === 'withdrawn' ? <Bi text={DRV.withdrewStatus} strong /> : null}
      {ask.status === 'no_reply' ? <Bi text={DRV.noReplyStatus} strong /> : null}
      {ask.status === 'cancelled' ? <Bi text={DRV.cancelledStatus} strong /> : null}
      {ask.offerEtaMinute !== null && ask.status !== 'not_picked' ? (
        <Bi text={DRV.offered(hhmm(ask.offerEtaMinute))} />
      ) : null}
      {showRoute ? (
        <View style={styles.steps}>
          {pickedUpShown ? <Bi text={DRV.pickedUp(hhmm(pickedUpAt!))} /> : null}
          {ask.deliveredMinute !== null && ask.deliveredMinute <= now ? (
            <>
              <Bi text={DRV.delivered(hhmm(ask.deliveredMinute))} strong />
              <Bi text={ask.onTime ? DRV.onTime : DRV.late} />
            </>
          ) : (
            <Bi text={DRV.notYet} tone="muted" />
          )}
        </View>
      ) : null}
      {ask.status === 'withdrawn' || ask.status === 'no_reply' || ask.status === 'cancelled' ? (
        <Bi text={DRV.missedNote} tone="muted" />
      ) : null}
      {ask.status === 'picked' ? (
        <View style={styles.actions}>
          <Button label={DRV.commit} primary onPress={onCommit} />
          <Button label={DRV.withdraw} alert onPress={onWithdraw} accessibilityHint={spoken(DRV.withdrawWarn)} />
        </View>
      ) : null}
      {ask.status === 'picked' ? <Bi text={DRV.withdrawWarn} tone="muted" /> : null}
      {showRoute ? (
        <>
          <View style={styles.actions}>
            <Button label={DRV.maps} primary onPress={onMaps} />
          </View>
          <Text style={[TYPE.label, { color: c.onKraftMuted, marginTop: SPACE.s }]}>{splitBi(DRV.route).fil.toUpperCase()}</Text>
          <Text style={[TYPE.small, { color: c.onKraft }]} accessibilityLabel={spoken(DRV.route)}>
            {DRV.routeLine(donor.name, donor.street, pantry.name, pantry.street)}
          </Text>
        </>
      ) : null}
    </View>
  );
}

/** Opens the Google Maps directions; if no app takes the link, the browser does. */
export async function openDirections(donor: Donor, pantry: Pantry): Promise<void> {
  // Every bundled donor and pantry has coordinates; a place without them has no link to open.
  const from = donorPosition(donor.id);
  const to = pantryPosition(pantry.id);
  if (!from || !to) return;
  const url = directionsUrl(from, to);
  try {
    await Linking.openURL(url);
  } catch {
    await WebBrowser.openBrowserAsync(url);
  }
}

/** The drivers who receive requests, as a row of chips. The chosen one is the profile this phone holds. */
export function DriverChooser({
  drivers,
  selectedId,
  onSelect,
  locked,
}: {
  drivers: readonly Driver[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** True after 17:00 or while the clock runs: the driver cannot change (see driver/chooser.ts). */
  locked: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.chooser}>
      <Bi text={DRV.chooserLabel} strong surface="ground" />
      <Bi text={DRV.chooserHint} tone="muted" surface="ground" />
      {locked ? <Bi text={DRV.chooserLocked} tone="muted" surface="ground" /> : null}
      <View style={styles.chips}>
        {drivers.map((d) => {
          const on = d.id === selectedId;
          return (
            <Pressable
              key={d.id}
              onPress={() => onSelect(d.id)}
              disabled={locked && !on}
              accessibilityRole="button"
              accessibilityLabel={DRV.chooserItem(d.name)}
              accessibilityState={{ selected: on, disabled: locked && !on }}
              style={[styles.chip, { backgroundColor: on ? c.tarp : 'transparent', borderColor: c.text }]}
            >
              <Text style={[TYPE.label, { color: on ? c.onTarp : c.text }]}>{d.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Slot({ label, value }: { label: string; value: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.slot}>
      <Text style={[TYPE.label, { color: c.onKraftMuted }]}>{splitBi(label).fil.toUpperCase()}</Text>
      <Text style={[TYPE.bodyStrong, { color: c.onKraft }]}>{value}</Text>
    </View>
  );
}

function stickerOf(status: Ask['status']): { text: string; kind: StickerKind } {
  switch (status) {
    case 'picked': return { text: DRV.stickerPicked, kind: 'live' };
    case 'committed': return { text: DRV.stickerCommitted, kind: 'done' };
    case 'delivered': return { text: DRV.stickerDelivered, kind: 'done' };
    case 'not_picked': return { text: DRV.stickerNotPicked, kind: 'quiet' };
    default: return { text: DRV.stickerMissed, kind: 'problem' };
  }
}

const styles = StyleSheet.create({
  tag: { borderWidth: 1.5, borderRadius: 4, padding: SPACE.l, gap: SPACE.s },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.s, flexWrap: 'wrap' },
  rule: { height: 2, borderRadius: 1, opacity: 0.6 },
  slot: { gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s, marginTop: SPACE.xs },
  button: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: SPACE.m,
    paddingVertical: SPACE.s,
    borderWidth: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  steps: { gap: SPACE.xs },
  chooser: { gap: SPACE.xs },
  info: { gap: SPACE.s },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s, paddingVertical: SPACE.xs },
  chip: { minHeight: 48, justifyContent: 'center', paddingHorizontal: SPACE.m, borderWidth: 2, borderRadius: 4 },
});
