import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { AwardState, Lot, LotId } from '../engine/types';
import { dash } from '../i18n/strings';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';
import { Sticker, type StickerKind } from './Sticker';

export type StripState = AwardState | 'bids';

const KIND: Record<StripState, StickerKind> = {
  announced: 'quiet',
  bids: 'quiet',
  tentative: 'live',
  final: 'done',
  delivered: 'done',
  stranded: 'problem',
  unawarded: 'problem',
};

/**
 * The lot strip: one kraft chip per lot posted so far, oldest on the left, newest on the right. Each chip is a button
 * with the lot's name and its state. The strip follows the newest lot when a lot is posted.
 */
export function LotStrip({
  lots,
  stateOf,
  selectedId,
  onSelect,
}: {
  lots: readonly Lot[];
  stateOf: (id: LotId) => StripState;
  selectedId: LotId | null;
  onSelect: (id: LotId) => void;
}) {
  const { c, reduceMotion } = useTheme();
  const scroller = useRef<ScrollView>(null);
  // A lot was posted: bring the newest chip into view.
  useEffect(() => {
    scroller.current?.scrollToEnd({ animated: !reduceMotion });
  }, [lots.length, reduceMotion]);

  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="list"
    >
      {lots.map((lot) => {
        const state = stateOf(lot.id);
        const selected = lot.id === selectedId;
        const item = lot.items.map((i) => i.foodItem).join(', ');
        return (
          <Pressable
            key={lot.id}
            onPress={() => onSelect(lot.id)}
            accessibilityRole="button"
            accessibilityLabel={dash.chipA11y(item, dash.stateWords[state], lot.id)}
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: c.kraft,
                borderColor: selected ? c.onKraft : c.kraftEdge,
                borderWidth: selected ? 3 : 1.5,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={[TYPE.chipItem, { color: c.marker }]} numberOfLines={1}>
              {item}
            </Text>
            <Sticker text={dash.stateSticker[state]} kind={KIND[state]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: SPACE.s, paddingHorizontal: SPACE.l, paddingVertical: SPACE.xs },
  chip: {
    minWidth: 120,
    maxWidth: 200,
    minHeight: 56,
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: SPACE.m,
    paddingVertical: SPACE.s,
    borderRadius: 4,
  },
});
