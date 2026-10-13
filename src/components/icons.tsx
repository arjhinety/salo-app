import Svg, { Path, Rect } from 'react-native-svg';

/** Authored stroke icons, one weight (2), so they match the marker-and-string world. */
export function MicIcon({ size = 24, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      <Rect x={9} y={3} width={6} height={11} rx={3} stroke={color} strokeWidth={2} />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function FridgeIcon({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      <Rect x={6} y={3} width={12} height={18} rx={2} stroke={color} strokeWidth={2} />
      <Path d="M6 10h12M9 6v2M9 13v3" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Play: an outlined triangle, same stroke and weight as the rest of the set. */
export function PlayIcon({ size = 24, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M7 4.5v15l12.5-7.5z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

/** Pause: two outlined bars, same stroke and weight as the rest of the set. */
export function PauseIcon({ size = 24, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      <Rect x={6} y={4.5} width={4} height={15} rx={1} stroke={color} strokeWidth={2} />
      <Rect x={14} y={4.5} width={4} height={15} rx={1} stroke={color} strokeWidth={2} />
    </Svg>
  );
}
