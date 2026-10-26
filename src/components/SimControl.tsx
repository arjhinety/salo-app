import { Pressable, StyleSheet } from 'react-native';
import { dash, S } from '../i18n/strings';
import { SYNC } from '../i18n/sync';
import { useTheme } from '../theme/theme';
import { SPACE } from '../theme/tokens';
import { PauseIcon, PlayIcon } from './icons';

/**
 * DEMO ONLY: play and pause for the simulated evening, drawn on the tarp. Only the action that is available is
 * shown: Pause while the clock runs, Play otherwise, and a dimmed Play once the evening has ended.
 * `english` gives the dashboard labels; donor screens keep the Filipino ones.
 */
export function SimControl({
  running,
  ended,
  onPress,
  english = false,
  locked = false,
}: {
  running: boolean;
  ended: boolean;
  onPress: () => void;
  english?: boolean;
  /** A phone that follows a joined session cannot start or pause the clock (the dashboard does). */
  locked?: boolean;
}) {
  const off = ended || locked;
  const { c } = useTheme();
  const showPause = running && !ended;
  const label = english
    ? ended ? dash.finished : showPause ? dash.pause : dash.play
    : ended ? S.simDonor.finished
    : showPause ? S.simDonor.pause
    : S.simDonor.play;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={locked ? (english ? 'The clock comes from the dashboard' : SYNC.state.clockFromDashboard) : undefined}
      accessibilityState={{ disabled: off }}
      style={({ pressed }) => [styles.btn, { borderColor: c.onTarp, opacity: off ? 0.4 : pressed ? 0.7 : 1 }]}
    >
      {showPause ? <PauseIcon size={24} color={c.onTarp} /> : <PlayIcon size={24} color={c.onTarp} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 4,
    marginVertical: SPACE.xs,
  },
});
