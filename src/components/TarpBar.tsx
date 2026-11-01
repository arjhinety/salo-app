import type { ReactNode } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dash, S } from '../i18n/strings';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';

/**
 * The tarp canopy over the stall: wordmark, the simulated clock, and the simulated-data label.
 * `children` sit under the subtitle, on the tarp (the demo's play control uses this).
 */
export function TarpBar({
  clock,
  subtitle,
  children,
  chip,
  english,
}: {
  clock: string;
  subtitle?: string;
  children?: ReactNode;
  /** The label on the simulated-data chip. Defaults to the Filipino "SIMULASYON". */
  chip?: { text: string; label: string };
  /** Dashboard copy is English; donor and picker screens keep the Filipino labels. */
  english?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const chipText = chip?.text ?? S.simulated.fil.toUpperCase();
  const chipLabel = chip?.label ?? `${S.simulated.fil}. ${S.simulated.en}.`;
  const clockLabel = english ? dash.clockA11y(clock) : S.clockA11y(clock);
  return (
    <View style={[styles.bar, { backgroundColor: c.tarp, paddingTop: insets.top + SPACE.s }]}>
      <View style={styles.row}>
        <Text style={[TYPE.wordmark, { color: c.onTarp }]} accessibilityRole="header">
          {S.appName}
        </Text>
        <View style={styles.right}>
          <View style={[styles.chip, { borderColor: c.onTarp }]} accessible accessibilityLabel={chipLabel}>
            <Text style={[TYPE.label, { color: c.onTarp }]}>{chipText}</Text>
          </View>
          <Text style={[TYPE.title, { color: c.onTarp }]} accessibilityLabel={clockLabel}>
            {clock}
          </Text>
        </View>
      </View>
      {subtitle ? <Text style={[TYPE.small, { color: c.onTarp, opacity: 0.92 }]}>{subtitle}</Text> : null}
      {children}
      {/* the tarp's hem */}
      <View style={[styles.hem, { backgroundColor: c.onTarp }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: SPACE.l, paddingBottom: SPACE.m, gap: SPACE.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.m, flexWrap: 'wrap' },
  right: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  chip: { borderWidth: 1.5, borderRadius: 4, paddingHorizontal: SPACE.s, paddingVertical: 2 },
  hem: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, opacity: 0.18 },
});
