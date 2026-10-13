import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { S } from '../i18n/strings';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';
import { MicIcon } from './icons';

/** The one primary action (Material extended FAB): post tonight's surplus. */
export function PostFab({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${S.post.fil}. ${S.post.en}.`}
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: c.tarp, bottom: insets.bottom + SPACE.l, opacity: pressed ? 0.88 : 1 },
      ]}
    >
      <MicIcon color={c.onTarp} />
      <Text style={[TYPE.bodyStrong, { color: c.onTarp }]}>{S.post.fil}</Text>
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
});
