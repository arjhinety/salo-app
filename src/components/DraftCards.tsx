import { AccessibilityInfo, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { catalogKey, estKgFor, findEntry, type CatalogEntry } from '../donor/catalog';
import { clampAmount, type DraftItem } from '../donor/postForm';
import { S } from '../i18n/strings';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';
import { FridgeIcon } from './icons';

/** Below this width (after font scale) the stepper and its label stack vertically, as the donor home does. */
const STACK_BELOW = 360;

/**
 * The confirm cards for a post: one kraft card per item (DON-02). Fed by a plain DraftItem array and reports the next
 * array through onChange, so the same component can show what the M4 parser produces. Items the catalog does not know
 * are not drawn.
 */
export function DraftCards({
  items,
  onChange,
}: {
  items: readonly DraftItem[];
  onChange: (next: DraftItem[]) => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width / fontScale < STACK_BELOW;
  return (
    <View style={styles.list}>
      {items.map((item, i) => {
        const entry = findEntry(item.foodItem, item.unit);
        if (!entry) return null;
        return (
          <DraftCard
            key={catalogKey(item.foodItem, item.unit)}
            item={item}
            entry={entry}
            stacked={stacked}
            onQuantity={(quantity) => onChange(items.map((x, j) => (j === i ? { ...x, quantity } : x)))}
            onRemove={() => onChange(items.filter((_, j) => j !== i))}
          />
        );
      })}
    </View>
  );
}

function DraftCard({
  item,
  entry,
  stacked,
  onQuantity,
  onRemove,
}: {
  item: DraftItem;
  entry: CatalogEntry;
  stacked: boolean;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const { c } = useTheme();
  const q = item.quantity;
  const unitFil = S.units[entry.unit];
  const kg = estKgFor(q, entry);
  const atMin = q <= 1;
  const atMax = q >= entry.maxQty;
  const showEn = entry.foodItemFil !== entry.foodItem;

  const change = (next: number) => {
    const clamped = clampAmount(entry, next);
    if (clamped === q) return;
    onQuantity(clamped);
    AccessibilityInfo.announceForAccessibility(S.postForm.amountSaid(clamped, unitFil, entry.unit));
  };

  return (
    <View style={[styles.card, { backgroundColor: c.kraft, borderColor: c.kraftEdge }]}>
      <View style={styles.head}>
        <View style={styles.names}>
          <Text style={[TYPE.item, { color: c.marker }]}>{entry.foodItemFil}</Text>
          {showEn ? <Text style={[TYPE.small, { color: c.onKraftMuted }]}>{entry.foodItem}</Text> : null}
        </View>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={S.postForm.removeA11y(entry.foodItemFil, entry.foodItem)}
          style={({ pressed }) => [styles.remove, { borderColor: c.kraftEdge, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[TYPE.bodyStrong, { color: c.onKraft }]}>×</Text>
        </Pressable>
      </View>
      <View style={[styles.rule, { backgroundColor: c.kraftEdge }]} />
      <View style={[styles.row, stacked ? styles.rowStacked : null]}>
        <Text style={[TYPE.label, { color: c.onKraftMuted }]}>{S.postForm.amount}</Text>
        <View style={styles.stepper}>
          <Pressable
            onPress={() => change(q - 1)}
            disabled={atMin}
            accessibilityRole="button"
            accessibilityState={{ disabled: atMin }}
            accessibilityLabel={S.postForm.decreaseA11y(entry.foodItemFil, entry.foodItem)}
            style={({ pressed }) => [styles.step, { backgroundColor: c.tape, borderColor: c.kraftEdge, opacity: atMin ? 0.4 : pressed ? 0.7 : 1 }]}
          >
            <Text style={[TYPE.bodyStrong, { color: c.onTape }]}>−</Text>
          </Pressable>
          <Text style={[TYPE.bodyStrong, styles.value, { color: c.onKraft }]}>
            {q} {unitFil}
          </Text>
          <Pressable
            onPress={() => change(q + 1)}
            disabled={atMax}
            accessibilityRole="button"
            accessibilityState={{ disabled: atMax }}
            accessibilityLabel={S.postForm.increaseA11y(entry.foodItemFil, entry.foodItem)}
            style={({ pressed }) => [styles.step, { backgroundColor: c.tape, borderColor: c.kraftEdge, opacity: atMax ? 0.4 : pressed ? 0.7 : 1 }]}
          >
            <Text style={[TYPE.bodyStrong, { color: c.onTape }]}>+</Text>
          </Pressable>
        </View>
      </View>
      <Text style={[TYPE.small, { color: c.onKraft }]}>{S.postForm.kg(kg)}</Text>
      <View style={[styles.row, stacked ? styles.rowStacked : null]}>
        <Text style={[TYPE.label, { color: c.onKraftMuted }]}>{S.postForm.storage}</Text>
        {entry.needsFridgeIfKept ? (
          <View style={styles.fridge}>
            <FridgeIcon color={c.onKraft} />
            <Text style={[TYPE.small, { color: c.onKraft, flexShrink: 1 }]}>{S.postForm.fridge}</Text>
          </View>
        ) : (
          <Text style={[TYPE.small, { color: c.onKraft, flexShrink: 1 }]}>{S.postForm.noFridge}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACE.m },
  card: { borderWidth: 1.5, borderRadius: 6, padding: SPACE.m, gap: SPACE.s },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.s },
  names: { flex: 1, gap: 2 },
  remove: {
    width: 48,
    height: 48,
    borderWidth: 1,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rule: { height: 1, opacity: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.s, flexWrap: 'wrap' },
  rowStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  step: {
    width: 48,
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { minWidth: 72, textAlign: 'center' },
  fridge: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
});
