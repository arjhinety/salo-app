import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/theme';
import { TYPE } from '../theme/tokens';

export type StickerKind = 'live' | 'done' | 'problem' | 'quiet';

/**
 * A stamp slapped on a tag. Lime is reserved for the one live state (TENTATIVE: held until a driver
 * commits); the others are marker on kraft so the lime keeps its meaning.
 */
export function Sticker({ text, kind }: { text: string; kind: StickerKind }) {
  const { c } = useTheme();
  const look =
    kind === 'live' ? { backgroundColor: c.lime, borderColor: c.onLime, color: c.onLime }
    : kind === 'problem' ? { backgroundColor: 'transparent', borderColor: c.onKraftAlert, color: c.onKraftAlert }
    : kind === 'done' ? { backgroundColor: 'transparent', borderColor: c.onKraft, color: c.onKraft }
    : { backgroundColor: 'transparent', borderColor: c.onKraftMuted, color: c.onKraftMuted };
  return (
    <View
      style={[styles.sticker, { backgroundColor: look.backgroundColor, borderColor: look.borderColor }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Text style={[TYPE.sticker, { color: look.color }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sticker: {
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    transform: [{ rotate: '-4deg' }],
  },
});
