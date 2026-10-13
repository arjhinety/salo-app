import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { LotView } from '../donor/tonight';
import { hhmm } from '../donor/tonight';
import { S } from '../i18n/strings';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';
import { FridgeIcon } from './icons';
import { JourneyLine } from './JourneyLine';
import { Sticker, type StickerKind } from './Sticker';

const CHAMFER = 22;
const HOLE_Y = 16;
const DROP = 26; // string length from the main string to the tag's hole

function stickerFor(v: LotView): { text: string; kind: StickerKind } {
  switch (v.state) {
    case 'tentative': return { text: S.states.tentative.sticker, kind: 'live' };
    case 'final': return { text: S.states.final.sticker, kind: 'done' };
    case 'delivered': return { text: S.states.delivered.sticker, kind: 'done' };
    case 'stranded': return { text: S.states.stranded.sticker, kind: 'problem' };
    case 'unawarded': return { text: S.states.unawarded.sticker, kind: 'problem' };
    case 'bids': return { text: S.states.bids.sticker, kind: 'quiet' };
    default: return { text: S.states.announced.sticker, kind: 'quiet' };
  }
}

/**
 * What TalkBack reads for the whole tag: item, amount, deadline, state, and who has it. A tentative tag does not
 * say the word "Tentative" here: its sentence already says the food is held (Codex review, decision kept).
 */
export function tagLabel(v: LotView): string {
  const it = v.lot.items[0];
  const head = `${it.foodItemFil}, ${it.quantity} ${S.units[it.unit]}. Kunin bago ${hhmm(v.lot.pickupByMinute)}.`;
  switch (v.state) {
    case 'tentative':
      return `${head} ${S.tagWho.tentative(v.pantryName ?? '', S.heldUntilDriver.fil)}`;
    case 'final':
      return `${head} ${S.states.final.fil}. ${S.tagWho.final(v.pantryName ?? '', v.driverName ?? '', hhmm(v.etaMinute!))}`;
    case 'delivered':
      return `${head} ${S.states.delivered.fil}. ${S.tagWho.delivered(v.pantryName ?? '', v.driverName ?? '')}`;
    case 'bids':
      return `${head} ${S.states.bids.fil}. ${S.tagWho.bids(v.bids)}`;
    default:
      return `${head} ${S.states[v.state].fil}.`;
  }
}

/** One lot as a kraft price tag hanging from the stall's string. */
export function Tag({ view, onPress }: { view: LotView; onPress?: () => void }) {
  const { c } = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const it = view.lot.items[0];
  const sticker = stickerFor(view);
  const { w, h } = size;
  const shape = `M${CHAMFER} 0 H${w - CHAMFER} L${w} ${CHAMFER} V${h} H0 V${CHAMFER} Z`;
  const failed = view.state === 'stranded' || view.state === 'unawarded';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={tagLabel(view)}
      accessibilityHint={onPress ? S.openLot : undefined}
      style={({ pressed }) => [styles.wrap, { transform: [{ translateY: pressed ? 3 : 0 }] }]}
    >
      {/* the drop of string from the main string to the hole */}
      <Svg width={2} height={DROP + HOLE_Y} style={styles.drop}>
        <Line x1={1} y1={0} x2={1} y2={DROP + HOLE_Y} stroke={c.zinc} strokeWidth={2} />
      </Svg>
      <View style={styles.tag} onLayout={onLayout}>
        {w > 0 && (
          <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
            <Path d={shape} fill={c.kraft} stroke={c.kraftEdge} strokeWidth={1.5} />
            <Circle cx={w / 2} cy={HOLE_Y} r={6} fill={c.ground} stroke={c.kraftEdge} strokeWidth={2} />
          </Svg>
        )}
        <View style={styles.stickerRow}>
          <Sticker text={sticker.text} kind={sticker.kind} />
        </View>
        <Text style={[TYPE.item, { color: c.marker }]} numberOfLines={2}>
          {it.foodItemFil}
        </Text>
        {it.foodItemFil !== it.foodItem ? (
          <Text style={[TYPE.small, { color: c.onKraftMuted }]} numberOfLines={1}>{it.foodItem}</Text>
        ) : null}
        <View style={[styles.rule, { backgroundColor: c.kraftEdge }]} />
        <Slot label={S.slots.dami.fil} value={`${it.quantity} ${S.units[it.unit]}`} />
        <Slot label={S.slots.kunin.fil} value={hhmm(view.lot.pickupByMinute)} />
        {it.needsFridgeIfKept ? (
          <View style={styles.fridge}>
            <FridgeIcon color={c.onKraft} />
            <Text style={[TYPE.small, { color: c.onKraft, flexShrink: 1 }]}>{S.slots.ref.fil}</Text>
          </View>
        ) : null}
        {view.pantryName ? (
          <Text style={[TYPE.small, { color: c.onKraft }]} numberOfLines={2}>
            → {view.pantryName}
            {view.driverName ? ` · ${view.driverName}` : ''}
          </Text>
        ) : null}
        <View style={{ marginTop: SPACE.s }}>
          <JourneyLine station={view.station} failed={failed} />
        </View>
      </View>
    </Pressable>
  );
}

function Slot({ label, value }: { label: string; value: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.slot}>
      <Text style={[TYPE.label, { color: c.onKraftMuted }]}>{label.toUpperCase()}</Text>
      <Text style={[TYPE.bodyStrong, { color: c.onKraft }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', flex: 1, minWidth: 0 },
  drop: { marginBottom: -HOLE_Y, zIndex: 2 },
  tag: { alignSelf: 'stretch', paddingTop: HOLE_Y + 16, paddingHorizontal: SPACE.m, paddingBottom: SPACE.m, gap: 2 },
  // In flow, under the hole and right-aligned: it never covers the string's hole or the item name at any font scale.
  stickerRow: { alignSelf: 'flex-end' },
  rule: { height: 1, marginVertical: SPACE.s, opacity: 0.6 },
  slot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: SPACE.s, flexWrap: 'wrap' },
  fridge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
});
