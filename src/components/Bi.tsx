import { Text, View } from 'react-native';
import { splitBi } from '../i18n/driver';
import { useTheme } from '../theme/theme';
import { TYPE } from '../theme/tokens';

/**
 * A bilingual pair (DESIGN.md, The Bilingual Pair Rule): the Filipino line leads, the English line follows in Small.
 * `strong` sets the Filipino in Body Strong, `title` in Title (a screen's or a box's heading). `size="small"` sets both
 * lines in Small, for hints and state notes, so a hint never outweighs the heading above it. `surface` picks the ink:
 * text on a kraft tag, or text on the tarp's ground (light or night canopy). `tone` mutes the pair or marks it alert.
 */
export function Bi({
  text,
  strong = false,
  title = false,
  size = 'default',
  tone = 'ink',
  surface = 'kraft',
  nativeID,
}: {
  text: string;
  strong?: boolean;
  title?: boolean;
  size?: 'default' | 'small';
  tone?: 'ink' | 'muted' | 'alert';
  surface?: 'kraft' | 'ground';
  /** Set on the Filipino line, for a field labelled by it (accessibilityLabelledBy). */
  nativeID?: string;
}) {
  const { c } = useTheme();
  const { fil, en } = splitBi(text);
  const ink = surface === 'kraft' ? c.onKraft : c.text;
  const muted = surface === 'kraft' ? c.onKraftMuted : c.textMuted;
  const filColor = tone === 'alert' ? c.red : tone === 'muted' ? muted : ink;
  const filStyle = size === 'small' ? TYPE.small : title ? TYPE.title : strong ? TYPE.bodyStrong : TYPE.body;
  return (
    <View accessible={false}>
      <Text nativeID={nativeID} style={[filStyle, { color: filColor }]}>
        {fil}
      </Text>
      {en ? <Text style={[TYPE.small, { color: tone === 'alert' ? c.red : muted }]}>{en}</Text> : null}
    </View>
  );
}
