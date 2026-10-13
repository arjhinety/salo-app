import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../theme/theme';

/** The zinc string strung across the stall, with a slight sag, tied off at both ends. */
export function StallString() {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  return (
    <View style={{ height: 14 }} onLayout={onLayout} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {w > 0 && (
        <Svg width={w} height={14}>
          <Path d={`M4 4 Q ${w / 2} 12 ${w - 4} 4`} stroke={c.zinc} strokeWidth={2.5} fill="none" strokeLinecap="round" />
          <Circle cx={4} cy={4} r={3.5} fill={c.zinc} />
          <Circle cx={w - 4} cy={4} r={3.5} fill={c.zinc} />
        </Svg>
      )}
    </View>
  );
}
