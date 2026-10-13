import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { S } from '../i18n/strings';
import { useTheme } from '../theme/theme';
import { TYPE } from '../theme/tokens';

/**
 * A lot's journey as a line of stations (raised from the transit-diagram challenger):
 * Naipost, May bid, Tentative, May driver, Naihatid. Filled up to the current station.
 */
export function JourneyLine({ station, failed = false }: { station: number; failed?: boolean }) {
  const { c } = useTheme();
  const n = S.journey.length;
  const w = 100;
  const x = (i: number) => 6 + (i * (w - 12)) / (n - 1);
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width="100%" height={16} viewBox={`0 0 ${w} 16`} preserveAspectRatio="none">
        <Line x1={x(0)} y1={8} x2={x(n - 1)} y2={8} stroke={c.onKraftMuted} strokeWidth={1} strokeDasharray="2 2" />
        <Line x1={x(0)} y1={8} x2={x(station)} y2={8} stroke={failed ? c.onKraftAlert : c.onKraft} strokeWidth={2.5} />
      </Svg>
      <View style={styles.dots}>
        {S.journey.map((label, i) => (
          <Svg key={label} width={14} height={14} viewBox="0 0 14 14" style={{ position: 'absolute', left: `${(x(i) / w) * 100}%`, marginLeft: -7, top: -15 }}>
            <Circle cx={7} cy={7} r={i === station ? 5.5 : 4} fill={i <= station ? (failed && i === station ? c.onKraftAlert : c.onKraft) : c.kraft} stroke={c.onKraft} strokeWidth={1.5} />
          </Svg>
        ))}
      </View>
      <Text style={[TYPE.small, { color: c.onKraft, marginTop: 2 }]} numberOfLines={1}>
        {S.journey[station]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ dots: { height: 0 } });
