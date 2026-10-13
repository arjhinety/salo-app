import { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme/theme';
import { FONT } from '../theme/tokens';
import { clock24 } from '../live/tape';
import type { Minute } from '../engine/types';

/** The ruler runs 17:00 to 21:00. The evening itself stops at 21:30; the needle pins to the end past 21:00. */
export const RULER_START: Minute = 17 * 60;
export const RULER_END: Minute = 21 * 60;
const HEIGHT = 56;
const BASE_Y = 22;

/**
 * The evening ruler: a line from 17:00 to 21:00, a tick every half hour, an hour label, a small kraft mark where
 * each lot was posted, and a needle at the clock. The needle is the clock, so it moves in whole minutes.
 */
export function EveningRuler({ minute, postings }: { minute: Minute; postings: readonly Minute[] }) {
  const { c } = useTheme();
  const { width: screen } = useWindowDimensions();
  const pad = 16;
  const w = Math.max(0, screen - pad * 2);
  const x = (m: Minute) => ((Math.min(RULER_END, Math.max(RULER_START, m)) - RULER_START) / (RULER_END - RULER_START)) * w;

  const ticks = useMemo(() => {
    const out: Minute[] = [];
    for (let m = RULER_START; m <= RULER_END; m += 30) out.push(m);
    return out;
  }, []);

  return (
    <View style={[styles.wrap, { width: w }]} accessible={false}>
      <Svg width={w} height={HEIGHT}>
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
              x={m === RULER_START ? 0 : m === RULER_END ? w : x(m)}
              y={HEIGHT - 2}
              fontFamily={FONT.labelRegular}
              fontSize={13}
              fill={c.textMuted}
              textAnchor={m === RULER_START ? 'start' : m === RULER_END ? 'end' : 'middle'}
            >
              {clock24(m)}
            </SvgText>
          ))}
        {/* the needle: a line from the top of the ruler to the baseline, with a head that points at the hour */}
        <Path d={`M${x(minute) - 6} 0 H${x(minute) + 6} L${x(minute)} 8 Z`} fill={c.text} />
        <Line x1={x(minute)} y1={8} x2={x(minute)} y2={BASE_Y + 12} stroke={c.text} strokeWidth={3} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', height: HEIGHT },
});
