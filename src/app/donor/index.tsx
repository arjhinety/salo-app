import { router } from 'expo-router';
import { ScrollView, StyleSheet, useWindowDimensions, View, Text } from 'react-native';
import { Bi } from '../../components/Bi';
import { PostFab } from '../../components/PostFab';
import { SimControl } from '../../components/SimControl';
import { StallString } from '../../components/StallString';
import { Tag } from '../../components/Tag';
import { TarpBar } from '../../components/TarpBar';
import { WORLD } from '../../data/dataset';
import { hhmm } from '../../donor/tonight';
import { SessionBanner } from '../../components/SessionBanner';
import { useFollowStatus } from '../../backend/useSession';
import { liveEvening, useLiveSnapshot, useLotViews } from '../../live/useLive';
import { lotCountEn, S } from '../../i18n/strings';
import { useTheme } from '../../theme/theme';
import { SPACE, TYPE } from '../../theme/tokens';

/** The stall on this phone: Karinderya ni Aling Oning (D01). Its lots come from the live simulated evening. */
const DONOR = 'D01';

export default function DonorHome() {
  const { c } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const sim = useLiveSnapshot();
  const following = useFollowStatus().state !== 'idle';
  const lots = useLotViews(DONOR);
  const donor = WORLD.donors.find((d) => d.id === DONOR)!;
  // Two tags per row; one when the screen is narrow or the text is enlarged (up to 200% font scale).
  const perRow = width / fontScale < 360 ? 1 : 2;
  const rows: (typeof lots)[] = [];
  for (let i = 0; i < lots.length; i += perRow) rows.push(lots.slice(i, i + perRow));

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <TarpBar clock={hhmm(sim.minute)} subtitle={`${donor.name} · ${donor.street}`}>
        <SimControl
          running={sim.running}
          ended={sim.ended}
          locked={following}
          onPress={() => (sim.running ? liveEvening.pause() : liveEvening.start())}
        />
      </TarpBar>
      <SessionBanner />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.heading}>
          <Text style={[TYPE.title, { color: c.text }]} accessibilityRole="header">
            {S.tonight.fil}
          </Text>
          <Text style={[TYPE.small, { color: c.textMuted }]}>
            {S.tonight.en} · {lotCountEn(lots.length)}
          </Text>
        </View>
        {lots.length === 0 ? (
          <View style={[styles.empty, { borderColor: c.zinc }]}>
            <Bi text={`${S.emptyTonight.fil} · ${S.emptyTonight.en}`} strong surface="ground" />
            <Bi text={S.emptyTonight.hint} size="small" tone="muted" surface="ground" />
          </View>
        ) : (
          rows.map((row, i) => (
            <View key={i}>
              <StallString />
              <View style={styles.tags}>
                {row.map((v) => (
                  <Tag key={v.lot.id} view={v} />
                ))}
                {row.length < perRow ? <View style={{ flex: 1 }} /> : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>
      <PostFab onPress={() => router.push('/donor/post')} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: SPACE.l, paddingTop: SPACE.xl, paddingBottom: 120, gap: SPACE.xl },
  heading: { gap: 2 },
  tags: { flexDirection: 'row', gap: SPACE.l, paddingHorizontal: SPACE.s, marginTop: -6 },
  empty: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 4, padding: SPACE.l, gap: SPACE.s },
});
