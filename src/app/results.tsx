import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NOT_MEASURED, RESULTS_COPY as C } from '../results/copy';
import { currentModel, type Row } from '../results/model';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';

/**
 * The Results screen (RES-01 to RES-07). Gated: while the pre-registration gate is closed, every number reads
 * "Not measured yet" and only E21 to E64 are named (RES-06). English, simulated data, labelled.
 */
export default function Results() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const m = currentModel();

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/dashboard' as Href);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={[styles.band, { backgroundColor: c.tarp, paddingTop: insets.top + SPACE.s }]}>
        <Pressable
          onPress={back}
          accessibilityRole="button"
          accessibilityLabel={C.back}
          style={({ pressed }) => [styles.back, { borderColor: c.onTarp, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[TYPE.bodyStrong, { color: c.onTarp }]}>{C.back}</Text>
        </Pressable>
        <Text style={[TYPE.wordmark, { color: c.onTarp }]} accessibilityRole="header">
          {C.title}
        </Text>
        <Text style={[TYPE.small, { color: c.onTarp }]}>{C.subtitle}</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.xxl }]}>
        {m.gateLine ? (
          <View style={[styles.paper, { backgroundColor: c.tape, borderColor: c.kraftEdge }]}>
            <Text style={[TYPE.tapeBody, { color: c.onTape }]} accessibilityLiveRegion="polite">
              {m.gateLine}
            </Text>
          </View>
        ) : null}
        <Text style={[TYPE.small, { color: c.textMuted }]}>{C.evenings}</Text>

        <Section title={C.policiesHeading}>
          {m.policies.map((p) => (
            <View key={p.id} style={styles.policy} accessible={false}>
              <Text style={[TYPE.bodyStrong, { color: c.text }]} accessibilityRole="header">
                {p.label}
              </Text>
              {p.cells.map((cell) => (
                <RowLine key={cell.label} label={cell.label} value={cell.value} />
              ))}
            </View>
          ))}
        </Section>

        <Section title={C.mainHeading}>
          {m.mainRows.map((r) => (
            <RowLine key={r.label} label={r.label} value={r.value} />
          ))}
        </Section>

        <Section title={C.verdictHeading}>
          <Text
            style={[TYPE.bodyStrong, { color: m.verdict === NOT_MEASURED ? c.textMuted : c.text }]}
            accessibilityLiveRegion="polite"
          >
            {m.verdict}
          </Text>
        </Section>

        <Section title={C.supportingHeading}>
          <Text style={[TYPE.small, { color: c.textMuted }]}>{C.supportingNote}</Text>
          {m.supportingRows.map((r) => (
            <RowLine key={r.label} label={r.label} value={r.value} />
          ))}
        </Section>

        <Section title={C.learningHeading}>
          {m.learningRows.map((r) => (
            <RowLine key={r.label} label={r.label} value={r.value} />
          ))}
        </Section>

        <Section title={C.ceilingHeading}>
          {m.ceilingRows.map((r) => (
            <RowLine key={r.label} label={r.label} value={r.value} />
          ))}
        </Section>

        <Section title="">
          <Text style={[TYPE.small, { color: c.textMuted }]}>{C.method}</Text>
          {m.footer.map((r) => (
            <RowLine key={r.label} label={r.label} value={r.value} />
          ))}
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.section, { borderTopColor: c.rule }]}>
      {title ? (
        <Text style={[TYPE.title, { color: c.text }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** One label and value. The value reads "Not measured yet" in the muted colour while the gate is closed. */
function RowLine({ label, value }: Row) {
  const { c } = useTheme();
  const pending = value === NOT_MEASURED;
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[TYPE.small, styles.lineLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[TYPE.bodyStrong, styles.lineValue, { color: pending ? c.textMuted : c.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { paddingHorizontal: SPACE.l, paddingBottom: SPACE.l, gap: SPACE.xs },
  back: {
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: SPACE.m,
    borderWidth: 1.5,
    borderRadius: 4,
    marginBottom: SPACE.s,
  },
  content: { padding: SPACE.l, gap: SPACE.l },
  paper: { borderWidth: 1.5, borderRadius: 4, padding: SPACE.l },
  section: { borderTopWidth: 1, paddingTop: SPACE.m, gap: SPACE.s },
  policy: { gap: SPACE.xs, paddingBottom: SPACE.s },
  line: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: SPACE.s, minHeight: 28 },
  lineLabel: { flexShrink: 1, flexGrow: 1 },
  lineValue: { textAlign: 'right', flexShrink: 1 },
});
