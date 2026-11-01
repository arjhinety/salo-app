import { Pressable, StyleSheet, useWindowDimensions, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { S } from '../i18n/strings';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';
import { MicIcon } from './icons';

/** At or above this system font scale the label would crowd the screen, so the button becomes a round icon. */
const ICON_ONLY_FONT_SCALE = 1.5;

/**
 * The one primary action (Material extended FAB): post tonight's surplus. At 150% font scale and up it is a
 * 56 dp round icon-only button; the accessibility label stays the same, so TalkBack reads the same name.
 */
export function PostFab({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const iconOnly = fontScale >= ICON_ONLY_FONT_SCALE;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${S.post.fil}. ${S.post.en}.`}
      style={({ pressed }) => [
        styles.fab,
        iconOnly ? styles.round : null,
        { backgroundColor: c.tarp, bottom: insets.bottom + SPACE.l, opacity: pressed ? 0.88 : 1 },
      ]}
    >
      <MicIcon color={c.onTarp} size={iconOnly ? 26 : 24} />
      {iconOnly ? null : <Text style={[TYPE.bodyStrong, { color: c.onTarp }]}>{S.post.fil}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: SPACE.l,
    minHeight: 56,
    paddingHorizontal: SPACE.l + 4,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s,
    elevation: 6,
    shadowColor: '#0f2f7a',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  round: {
    width: 56,
    height: 56,
    minHeight: 56,
    borderRadius: 28,
    paddingHorizontal: 0,
    justifyContent: 'center',
    gap: 0,
  },
});
