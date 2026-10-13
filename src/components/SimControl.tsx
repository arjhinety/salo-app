import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';

/**
 * DEMO ONLY: play and pause for the simulated evening. Outlined on the tarp, kept quiet. Whether it stays in
 * the demo-day release build is an open question (see the M3 handoff).
 */
export function SimControl({ running, ended, onPress }: { running: boolean; ended: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const label = ended
    ? 'Tapos na ang simulasyon. Simulation finished.'
    : running
      ? 'Ihinto ang simulasyon. Pause the simulation.'
      : 'Ituloy ang simulasyon. Play the simulation.';
  return (
    <Pressable
      onPress={onPress}
      disabled={ended}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: ended }}
      style={({ pressed }) => [styles.btn, { borderColor: c.onTarp, opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={[TYPE.small, { color: c.onTarp }]}>
        {ended ? (
          'Simulasyon: tapos na'
        ) : (
          <>
            {'Simulasyon: '}
            <Text style={{ opacity: running ? 0.5 : 1 }}>▶</Text>
            {'/'}
            <Text style={{ opacity: running ? 1 : 0.5 }}>❚❚</Text>
          </>
        )}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: SPACE.m,
    borderWidth: 1.5,
    borderRadius: 4,
  },
});
