import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { S } from '../i18n/strings';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';

/**
 * The tarp canopy over the stall: wordmark, the simulated clock, and the simulated-data label.
 * `children` sit under the subtitle, on the tarp (the demo's play control uses this).
 */
export function TarpBar({ clock, subtitle, children }: { clock: string; subtitle?: string; children?: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { backgroundColor: c.tarp, paddingTop: insets.top + SPACE.s }]}>
      <View style={styles.row}>
        <Text style={[TYPE.wordmark, { color: c.onTarp }]} accessibilityRole="header">
          {S.appName}
        </Text>
        <View style={styles.right}>
          <View
            style={[styles.chip, { borderColor: c.onTarp }]}
            accessible
            accessibilityLabel={`${S.simulated.fil}. ${S.simulated.en}.`}
          >
            <Text style={[TYPE.label, { color: c.onTarp }]}>{S.simulated.fil.toUpperCase()}</Text>
          </View>
          <Text style={[TYPE.title, { color: c.onTarp }]} accessibilityLabel={`Oras sa simulasyon ${clock}`}>
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
