import { StyleSheet, View, Text } from 'react-native';
import { PANTRY_COPY, twoDp } from '../../i18n/pantry';
import type { ValueParts } from '../../pantry/model';
import { useTheme } from '../../theme/theme';
import { SPACE, TYPE } from '../../theme/tokens';

const ROWS = ['need', 'storage', 'distance', 'freshness'] as const;

/**
 * The four parts of the pantry's value and their total, to two decimals (PAN-02). Read-only: the coordinator
 * cannot edit a bid. TalkBack reads the whole table as one line, so the numbers are never read as loose digits.
 */
export function ValueTable({ value }: { value: ValueParts }) {
  const { c } = useTheme();
  const spoken = ROWS.map((k) => `${PANTRY_COPY.parts[k].fil}: ${twoDp(value[k])}`).join('. ');
  return (
    <View
      accessible
      accessibilityLabel={`${PANTRY_COPY.value.heading.fil}. ${spoken}. ${PANTRY_COPY.parts.total.fil}: ${twoDp(value.total)}.`}
      style={[styles.box, { borderColor: c.rule }]}
    >
      {ROWS.map((k) => (
        <View key={k} style={styles.row}>
          <View style={styles.labels}>
            <Text style={[TYPE.bodyStrong, { color: c.text }]}>{PANTRY_COPY.parts[k].fil}</Text>
            <Text style={[TYPE.small, { color: c.textMuted }]}>{PANTRY_COPY.parts[k].en}</Text>
          </View>
          <Text style={[TYPE.title, { color: c.text }]}>{twoDp(value[k])}</Text>
        </View>
      ))}
      <View style={[styles.row, styles.total, { borderTopColor: c.text }]}>
        <View style={styles.labels}>
          <Text style={[TYPE.bodyStrong, { color: c.text }]}>{PANTRY_COPY.parts.total.fil}</Text>
          <Text style={[TYPE.small, { color: c.textMuted }]}>{PANTRY_COPY.parts.total.en}</Text>
        </View>
        <Text style={[TYPE.title, { color: c.text }]}>{twoDp(value.total)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1.5, borderRadius: 4, padding: SPACE.m, gap: SPACE.s },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.m, minHeight: 44 },
  labels: { flexShrink: 1, gap: 2 },
  total: { borderTopWidth: 2, paddingTop: SPACE.s },
});
