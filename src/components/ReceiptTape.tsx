import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { barLabel, clock24, type TapeLine, type TapeRow, type TentativeBar } from '../live/tape';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';

/** A bar's length is its minutes: this many dp per simulated minute. Fixed, never scaled by the font setting. */
export const MINUTE_DP = 44;
const BAR_H = 14;
const TEAR_H = 10;
const TEAR_STEP = 10;

/** The receipt tape: off-white paper with a torn top edge, the lot's header on top, the lines below, newest last. */
export function ReceiptTape({
  rows,
  emptyText,
  header,
}: {
  rows: readonly TapeRow[];
  emptyText: string;
  header: ReactNode;
}) {
  const { c, reduceMotion } = useTheme();
  const { width } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  // Follow the newest line only while the reader is already at the bottom, so reading back is not interrupted.
  const following = useRef(true);

  // A new row is printed: bring it into view. The tape prints at the bottom, so a new row always scrolls to it.
  useEffect(() => {
    following.current = true;
    scroller.current?.scrollToEnd({ animated: !reduceMotion });
  }, [rows.length, reduceMotion]);

  return (
    <View style={styles.tapeArea}>
      <TornEdge width={width} color={c.tape} />
      <View style={[styles.paper, { backgroundColor: c.tape }]}>
        {header}
        {rows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[TYPE.tapeBody, { color: c.onTape }]}>{emptyText}</Text>
          </View>
        ) : (
          <ScrollView
            ref={scroller}
            style={styles.scroll}
            contentContainerStyle={styles.list}
            accessibilityRole="list"
            scrollEventThrottle={100}
            // Only the reader's own scrolling changes the follow flag. Scroll events fired while rows are added
            // report the old content size, so reading them as "not at the end" would stop the tape following.
            onScrollEndDrag={(e) => {
              following.current = atEnd(e.nativeEvent);
            }}
            onMomentumScrollEnd={(e) => {
              following.current = atEnd(e.nativeEvent);
            }}
            onContentSizeChange={() => {
              if (following.current) scroller.current?.scrollToEnd({ animated: !reduceMotion });
            }}
          >
            {rows.map((r) =>
              r.kind === 'line' ? (
                <LineRow key={r.key} line={r.line} strikeMinutes={r.strikeMinutes} />
              ) : (
                <BarRow key={r.key} bar={r.bar} />
              ),
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

type ScrollMetrics = {
  contentOffset: { y: number };
  layoutMeasurement: { height: number };
  contentSize: { height: number };
};

/** Within 24 dp of the bottom counts as reading the newest line. */
const atEnd = (m: ScrollMetrics): boolean => m.contentOffset.y + m.layoutMeasurement.height >= m.contentSize.height - 24;

/** The tear: a zigzag across the top of the paper, drawn in the paper's own color. */
function TornEdge({ width, color }: { width: number; color: string }) {
  let d = `M0 ${TEAR_H}`;
  let i = 0;
  for (let x = 0; x < width; x += TEAR_STEP, i++) d += ` L${x} ${i % 2 ? TEAR_H : 0}`;
  d += ` L${width} ${TEAR_H} Z`;
  return (
    <Svg width={width} height={TEAR_H} style={styles.tear} importantForAccessibility="no" accessibilityElementsHidden>
      <Path d={d} fill={color} />
    </Svg>
  );
}

/**
 * One line of the tape. The whole line is one Text, so a screen reader reads the full sentence. A FAILURE that struck
 * a wait carries the struck bar's copy under its text: same struck style, same length, hidden from TalkBack because the
 * bar's label is already read on its TENTATIVE line.
 */
function LineRow({ line, strikeMinutes }: { line: TapeLine; strikeMinutes: number | null }) {
  const { c } = useTheme();
  return (
    <View style={styles.lineWrap}>
      <Text style={[TYPE.tapeBody, { color: c.onTape }]} accessibilityRole="text">
        <Text style={[TYPE.tapeBody, { color: c.onTape }]}>{clock24(line.minute)}</Text>
        <Text>{'  '}</Text>
        <Text style={[TYPE.tapeType, { color: line.alert ? c.onKraftAlert : c.onTape }]}>{line.type}</Text>
        <Text style={[TYPE.tapeBody, { color: c.onTape }]}>
          {`  ${line.who}${line.detail ? ` · ${line.detail}` : ''}`}
        </Text>
      </Text>
      {strikeMinutes !== null ? (
        <View style={styles.strikeCopy} importantForAccessibility="no" accessibilityElementsHidden>
          <BarGlyph target={strikeMinutes * MINUTE_DP} struck width={strikeMinutes * MINUTE_DP} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The lime bar and its marker-red strike, drawn at `target` dp wide. `width` is the lime fill: the full length, or the
 * animated value while an open bar grows.
 */
function BarGlyph({ target, struck, width }: { target: number; struck: boolean; width: number | Animated.Value }) {
  const { c } = useTheme();
  return (
    <View style={{ width: target, height: BAR_H }}>
      <Animated.View
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={[styles.bar, { width, backgroundColor: c.lime, borderColor: c.onTape }]}
      />
      {struck ? (
        <Svg width={target} height={BAR_H} style={StyleSheet.absoluteFill} importantForAccessibility="no" accessibilityElementsHidden>
          <Line x1={-2} y1={BAR_H + 2} x2={target + 2} y2={-2} stroke={c.onKraftAlert} strokeWidth={3} strokeLinecap="round" />
        </Svg>
      ) : null}
    </View>
  );
}

/**
 * A TENTATIVE wait. The lime bar is `minutes * MINUTE_DP` wide. An open bar grows one minute at a time (animated,
 * or an instant jump under reduced motion). A FAILURE strikes it in marker red; a COMMIT caps it.
 */
function BarRow({ bar }: { bar: TentativeBar }) {
  const { c, reduceMotion } = useTheme();
  const target = bar.minutes * MINUTE_DP;
  const [grown] = useState(() => new Animated.Value(target));

  useEffect(() => {
    if (reduceMotion) {
      grown.setValue(target);
      return;
    }
    Animated.timing(grown, {
      toValue: target,
      duration: 320,
      easing: Easing.out(Easing.exp),
      useNativeDriver: false,
    }).start();
  }, [target, reduceMotion, grown]);

  const struck = bar.status === 'struck';
  return (
    <View style={styles.barWrap}>
      <BarGlyph target={target} struck={struck} width={reduceMotion ? target : grown} />
      <Text style={[TYPE.tapeType, styles.barLabel, { color: struck ? c.onKraftAlert : c.onTape }]} accessibilityRole="text">
        {barLabel(bar)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tapeArea: { flex: 1, minHeight: 0 },
  tear: { marginBottom: -1 },
  paper: { flex: 1, minHeight: 0, paddingHorizontal: SPACE.l, paddingBottom: SPACE.s },
  scroll: { flex: 1 },
  list: { paddingVertical: SPACE.s, gap: 2 },
  empty: { flex: 1, justifyContent: 'center', paddingVertical: SPACE.xl },
  lineWrap: { paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(22, 22, 22, 0.18)' },
  barWrap: { paddingVertical: SPACE.s, paddingLeft: SPACE.xs, gap: 4 },
  strikeCopy: { paddingTop: 4, paddingBottom: 2 },
  bar: { position: 'absolute', left: 0, top: 0, height: BAR_H, borderWidth: 1.5, borderRadius: 2 },
  barLabel: { lineHeight: 20 },
});
