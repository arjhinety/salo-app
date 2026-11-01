import { ScrollView, StyleSheet, View, Text } from 'react-native';
import type { PolicyId } from '../engine/types';
import { bidSpoken, bidText, type BidRow } from '../live/bids';
import { dash } from '../i18n/strings';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';

/**
 * The bids for the selected lot (DSH-03), printed on the same paper as the tape. Each row is one accessible element:
 * TalkBack reads the spoken label, where a struck share count is "was N shares".
 */
export function BidList({ rows, policy }: { rows: readonly BidRow[]; policy: PolicyId }) {
  const { c } = useTheme();
  return (
    <ScrollView style={[styles.paper, { backgroundColor: c.tape }]} contentContainerStyle={styles.list}>
      <Text style={[TYPE.tapeType, { color: c.onTape }]}>{dash.bidsTitle}</Text>
      {policy !== 'salo' ? <Text style={[TYPE.small, { color: c.onTape }]}>{dash.bidsBaseline}</Text> : null}
      {rows.length === 0 ? (
        <Text style={[TYPE.tapeBody, { color: c.onTape }]}>{dash.bidsEmpty}</Text>
      ) : (
        rows.map((row) => <BidRowView key={row.key} row={row} policy={policy} />)
      )}
    </ScrollView>
  );
}

function BidRowView({ row, policy }: { row: BidRow; policy: PolicyId }) {
  const { c } = useTheme();
  const t = bidText(row, policy);
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={bidSpoken(row, policy)} style={styles.row}>
      {t.refused ? (
        <Text style={[TYPE.tapeBody, { color: c.onTape }]}>
          {t.name}
          {'  '}
          <Text style={[TYPE.tapeType, { color: c.red }]}>{t.refused.tag}</Text>
          {`  ${t.refused.reason}`}
        </Text>
      ) : (
        <Text style={[TYPE.tapeBody, { color: c.onTape }]}>
          {t.name}
          {t.shares !== null ? (
            <>
              {' · '}
              <Text style={[t.struck ? styles.struck : null, t.struck ? { color: c.red } : null]}>{dash.sharesCount(t.shares)}</Text>
            </>
          ) : null}
          {t.facts.map((f) => ` · ${f}`).join('')}
        </Text>
      )}
      {t.remark ? (
        <Text style={[TYPE.small, { color: c.red, marginTop: 2 }]} importantForAccessibility="no">
          {t.remark}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { flex: 1 },
  list: { padding: SPACE.l, gap: SPACE.m },
  row: { gap: 2, paddingBottom: SPACE.s, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#0000001f' },
  struck: { textDecorationLine: 'line-through' },
});
