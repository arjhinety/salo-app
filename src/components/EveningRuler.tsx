import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useMemo } from 'react';
import type { Minute } from '../engine/types';
import { dash } from '../i18n/strings';
import { clock24 } from '../live/tape';
import { useTheme } from '../theme/theme';
import { FONT } from '../theme/tokens';

/** The ruler spans the whole evening, 17:00 to 21:30, the same range the clock can be seeked to. */
export const RULER_START: Minute = 17 * 60;
export const RULER_END: Minute = 21 * 60 + 30;
const HEIGHT = 56;
const BASE_Y = 22;
const PAD = 16;
/** One TalkBack increment or decrement moves the clock this many simulated minutes. */
export const RULER_STEP = 5;

/**
 * The evening ruler: a line from 17:00 to 21:30, a tick every half hour, an hour label, a small kraft mark where
 * each lot was posted, and a needle at the clock. Tap or drag on it to seek the clock (it pauses the run).
 * A screen reader gets an adjustable control: the value is the clock, and increment or decrement moves 5 minutes.
 */
export function EveningRuler({
  minute,
  postings,
  onSeek,
}: {
  minute: Minute;
  postings: readonly Minute[];
  onSeek: (minute: Minute) => void;
}) {
  const { c } = useTheme();
  const { width: screen } = useWindowDimensions();
  const w = Math.max(0, screen - PAD * 2);
  const span = RULER_END - RULER_START;
  const x = (m: Minute) => ((Math.min(RULER_END, Math.max(RULER_START, m)) - RULER_START) / span) * w;
  /** The whole minute under a touch x (in ruler coordinates), clamped to the evening. */
  const minuteAt = (px: number): Minute => {
    const f = w > 0 ? Math.min(1, Math.max(0, px / w)) : 0;
    return Math.round(RULER_START + f * span);
  };

  const ticks = useMemo(() => {
    const out: Minute[] = [];
    for (let m = RULER_START; m <= RULER_END; m += 30) out.push(m);
    return out;
  }, []);

  return (
    <View
      style={[styles.wrap, { width: w }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={dash.rulerA11y}
      accessibilityHint={dash.rulerHint}
      accessibilityValue={{ text: clock24(minute) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const step = e.nativeEvent.actionName === 'increment' ? RULER_STEP : -RULER_STEP;
        onSeek(minute + step);
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => onSeek(minuteAt(e.nativeEvent.locationX))}
      onResponderMove={(e) => onSeek(minuteAt(e.nativeEvent.locationX))}
    >
      <Svg width={w} height={HEIGHT} pointerEvents="none">
        <Line x1={0} y1={BASE_Y} x2={w} y2={BASE_Y} stroke={c.zinc} strokeWidth={2} />
        {ticks.map((m) => {
          const hour = m % 60 === 0;
          return (
            <Line
              key={m}
              x1={x(m)}
              y1={BASE_Y}
              x2={x(m)}
              y2={BASE_Y + (hour ? 10 : 5)}
              stroke={c.zinc}
              strokeWidth={hour ? 2 : 1.5}
            />
          );
        })}
        {postings.map((m, i) => (
          <Rect key={`p${i}`} x={x(m) - 2} y={BASE_Y - 9} width={4} height={7} fill={c.kraftEdge} />
        ))}
        {ticks
          .filter((m) => m % 60 === 0)
          .map((m) => (
            <SvgText
              key={`t${m}`}
              x={m === RULER_START ? 0 : x(m)}
              y={HEIGHT - 2}
              fontFamily={FONT.labelRegular}
              fontSize={13}
              fill={c.textMuted}
              textAnchor={m === RULER_START ? 'start' : 'middle'}
            >
              {clock24(m)}
            </SvgText>
          ))}
        {/* the needle: a head that points at the minute, with a stem down to the baseline */}
        <Path d={`M${x(minute) - 6} 0 H${x(minute) + 6} L${x(minute)} 8 Z`} fill={c.text} />
        <Line x1={x(minute)} y1={8} x2={x(minute)} y2={BASE_Y + 12} stroke={c.text} strokeWidth={3} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', height: HEIGHT },
});
