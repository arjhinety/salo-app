import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PANTRY_COPY } from '../../i18n/pantry';
import { lotFacts, tagLabel } from '../../pantry/lotText';
import type { PantryLotView, PantryStatus } from '../../pantry/model';
import { useTheme } from '../../theme/theme';
import { SPACE, TYPE } from '../../theme/tokens';
import { Sticker, type StickerKind } from '../Sticker';

/** Lime is reserved for the one live state, Tentative (held until a driver commits), as on the donor tags. */
const KIND: Record<PantryStatus, StickerKind> = {
  bidding: 'quiet',
  outbid: 'quiet',
  tentative: 'live',
  final: 'done',
  delivered: 'done',
  stranded: 'problem',
  refused: 'problem',
};

/**
 * One lot as a kraft price tag for the pantry: the same kraft, punched hole and marker item name as the donor's tags.
 * The status is a sticker with its word, so no state is carried by color alone.
 */
export function PantryTag({ view, onPress }: { view: PantryLotView; onPress: () => void }) {
  const { c } = useTheme();
  const f = lotFacts(view);
  const s = PANTRY_COPY.status[view.status];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={tagLabel(view)}
      accessibilityHint={PANTRY_COPY.openLot}
      style={({ pressed }) => [styles.wrap, { transform: [{ translateY: pressed ? 2 : 0 }] }]}
    >
      <View style={[styles.drop, { backgroundColor: c.zinc }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden />
      <View style={[styles.tag, { backgroundColor: c.kraft, borderColor: c.kraftEdge }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={[styles.hole, { borderColor: c.kraftEdge, backgroundColor: c.ground }]} />
        <View style={styles.stickerRow}>
          <Sticker text={s.sticker} kind={KIND[view.status]} />
        </View>
        <Text style={[TYPE.item, { color: c.marker }]} numberOfLines={2}>
          {f.item}
        </Text>
        <View style={[styles.rule, { backgroundColor: c.kraftEdge }]} />
        <Text style={[TYPE.bodyStrong, { color: c.onKraft }]}>{f.amount}</Text>
        <Text style={[TYPE.body, { color: c.onKraft }]}>{f.storage}</Text>
        <Text style={[TYPE.body, { color: c.onKraft }]}>{f.pickupBy}</Text>
        <Text style={[TYPE.body, { color: c.onKraft }]}>{f.distance}</Text>
        <Text style={[TYPE.small, { color: c.onKraftMuted, marginTop: SPACE.xs }]}>{`${s.fil} · ${s.en}`}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', minHeight: 48 },
  drop: { width: 2, height: 14 },
  tag: {
    alignSelf: 'stretch',
    borderWidth: 1.5,
    borderRadius: 6,
    paddingTop: 22,
    paddingHorizontal: SPACE.m,
    paddingBottom: SPACE.m,
    gap: SPACE.xs,
  },
  hole: { position: 'absolute', top: 8, alignSelf: 'center', left: '50%', marginLeft: -6, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  stickerRow: { alignSelf: 'flex-end' },
  rule: { height: 1, marginVertical: SPACE.xs, opacity: 0.6 },
});
