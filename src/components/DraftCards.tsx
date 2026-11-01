import { AccessibilityInfo, Pressable, StyleSheet, useWindowDimensions, View, Text } from 'react-native';
import { catalogKey, estKgFor, type CatalogEntry } from '../donor/catalog';
import { chooseEntry, reviewLine, type DraftLine, type LineIssue } from '../donor/fromParsed';
import { clampAmount } from '../donor/postForm';
import { S } from '../i18n/strings';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';
import { CloseIcon, FridgeIcon, MinusIcon, PlusIcon } from './icons';

/** Below this width (after font scale) the stepper and its label stack vertically, as the donor home does. */
const STACK_BELOW = 360;

/**
 * The confirm cards for a post: one kraft card per line (DON-02). A line that names a catalog item shows the amount
 * stepper and storage. A line that does not resolve shows what is missing and, when there are candidates, chips to
 * choose from. Reports the next array through onChange; the screen decides what posts.
 */
export function DraftCards({
  lines,
  onChange,
}: {
  lines: readonly DraftLine[];
  onChange: (next: DraftLine[]) => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width / fontScale < STACK_BELOW;
  return (
    <View style={styles.list}>
      {lines.map((line, i) => (
        <LineCard
          key={`${i}-${line.foodItem ?? line.rawText}-${line.unit ?? ''}`}
          line={line}
          stacked={stacked}
          onChange={(next) => onChange(lines.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(lines.filter((_, j) => j !== i))}
        />
      ))}
    </View>
  );
}

function issueText(issue: LineIssue, entry: CatalogEntry | null, hasChoices: boolean): string {
  switch (issue) {
    case 'unmatched':
      return hasChoices ? S.parsePost.unmatched : S.parsePost.noMatch;
    case 'missing_unit':
      return S.parsePost.missingUnit;
    case 'missing_quantity':
      return S.parsePost.missingQuantity;
    case 'over_max':
      return S.parsePost.overMax(entry?.maxQty ?? 0);
  }
}

function LineCard({
  line,
  stacked,
  onChange,
  onRemove,
}: {
  line: DraftLine;
  stacked: boolean;
  onChange: (next: DraftLine) => void;
  onRemove: () => void;
}) {
  const { c } = useTheme();
  const review = reviewLine(line);
  const entry = review.entry;
  const q = line.quantity;
  const unitFil = entry ? S.units[entry.unit] : '';
  const showEn = entry !== null && entry.foodItemFil !== entry.foodItem;
  const title = entry ? entry.foodItemFil : line.rawText.trim() || '—';

  const setQuantity = (next: number) => {
    if (!entry) return;
    const clamped = clampAmount(entry, next);
    if (clamped === q) return;
    onChange({ ...line, quantity: clamped });
    AccessibilityInfo.announceForAccessibility(S.postForm.amountSaid(clamped, unitFil, entry.unit));
  };

  return (
    <View style={[styles.card, { backgroundColor: c.kraft, borderColor: c.kraftEdge }]}>
      <View style={styles.head}>
        <View style={styles.names}>
          <Text style={[TYPE.item, { color: c.marker }]}>{title}</Text>
          {showEn && entry ? <Text style={[TYPE.small, { color: c.onKraftMuted }]}>{entry.foodItem}</Text> : null}
        </View>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={S.postForm.removeA11y(title, entry?.foodItem ?? line.rawText)}
          style={({ pressed }) => [styles.remove, { borderColor: c.kraftEdge, opacity: pressed ? 0.7 : 1 }]}
        >
          <CloseIcon color={c.onKraft} />
        </Pressable>
      </View>

      {review.issues.map((issue) => (
        <Text key={issue} style={[TYPE.small, styles.issue, { color: c.onKraft }]} accessibilityLiveRegion="polite">
          {issueText(issue, entry, review.choices.length > 0)}
        </Text>
      ))}

      {!entry && review.choices.length > 0 ? (
        <View style={styles.choices}>
          {review.choices.map((choice) => (
            <Pressable
              key={catalogKey(choice.foodItem, choice.unit)}
              onPress={() => onChange(chooseEntry(line, choice))}
              accessibilityRole="button"
              accessibilityLabel={S.parsePost.chooseA11y(choice.foodItemFil, choice.foodItem)}
              style={({ pressed }) => [styles.choice, { backgroundColor: c.groundRaised, borderColor: c.rule, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={[TYPE.bodyStrong, { color: c.text }]}>{choice.foodItemFil}</Text>
              {choice.foodItemFil !== choice.foodItem ? (
                <Text style={[TYPE.small, { color: c.textMuted }]}>{choice.foodItem}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {entry ? (
        <>
          <View style={[styles.rule, { backgroundColor: c.kraftEdge }]} />
          <View style={[styles.row, stacked ? styles.rowStacked : null]}>
            <Text style={[TYPE.label, { color: c.onKraftMuted }]}>{S.postForm.amount}</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => setQuantity(q === null ? entry.minQty : q - 1)}
                disabled={q !== null && q <= 1}
                accessibilityRole="button"
                accessibilityState={{ disabled: q !== null && q <= 1 }}
                accessibilityLabel={S.postForm.decreaseA11y(entry.foodItemFil, entry.foodItem)}
                style={({ pressed }) => [styles.step, { backgroundColor: c.tape, borderColor: c.kraftEdge, opacity: q !== null && q <= 1 ? 0.4 : pressed ? 0.7 : 1 }]}
              >
                <MinusIcon color={c.onTape} />
              </Pressable>
              <Text style={[TYPE.bodyStrong, styles.value, { color: c.onKraft }]}>
                {q === null ? '—' : `${q} ${unitFil}`}
              </Text>
              <Pressable
                onPress={() => setQuantity((q ?? entry.minQty) + 1)}
                disabled={q !== null && q >= entry.maxQty}
                accessibilityRole="button"
                accessibilityState={{ disabled: q !== null && q >= entry.maxQty }}
                accessibilityLabel={S.postForm.increaseA11y(entry.foodItemFil, entry.foodItem)}
                style={({ pressed }) => [styles.step, { backgroundColor: c.tape, borderColor: c.kraftEdge, opacity: q !== null && q >= entry.maxQty ? 0.4 : pressed ? 0.7 : 1 }]}
              >
                <PlusIcon color={c.onTape} />
              </Pressable>
            </View>
          </View>
          {q !== null ? <Text style={[TYPE.small, { color: c.onKraft }]}>{S.postForm.kg(estKgFor(q, entry))}</Text> : null}
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
        </>
      ) : null}
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
  issue: { fontWeight: '600' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s },
  choice: { minHeight: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: SPACE.m, paddingVertical: SPACE.s, justifyContent: 'center' },
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
