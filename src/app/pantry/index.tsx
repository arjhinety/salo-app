import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PantryTag } from '../../components/pantry/PantryTag';
import { SessionBanner } from '../../components/SessionBanner';
import { SimControl } from '../../components/SimControl';
import { useFollowStatus } from '../../backend/useSession';
import { StallString } from '../../components/StallString';
import { TarpBar } from '../../components/TarpBar';
import { PANTRY_COPY } from '../../i18n/pantry';
import { clockText } from '../../pantry/format';
import { myAwards, openLots, type PantryLotView } from '../../pantry/model';
import { usePantryFeed } from '../../pantry/usePantry';
import { SHARE_BUDGET_PER_EVENING } from '../../engine/params';
import { liveEvening, useLiveSnapshot } from '../../live/useLive';
import { useTheme } from '../../theme/theme';
import { SPACE, TYPE } from '../../theme/tokens';

/** The pantry coordinator's home: the shares left, my awards, and the open lots (PAN-01, PAN-04, PAN-05). */
export default function PantryHome() {
  const { c } = useTheme();
  const { profile } = useLocalSearchParams<{ profile?: string }>();
  const sim = useLiveSnapshot();
  const following = useFollowStatus().state !== 'idle';
  const feed = usePantryFeed(profile);
  const pantry = feed.pantry;

  if (!pantry) {
    return (
      <View style={{ flex: 1, backgroundColor: c.ground }}>
        <TarpBar clock={clockText(sim.minute)} />
        <View style={styles.body}>
          <Text style={[TYPE.title, { color: c.text }]} accessibilityRole="header">
            {PANTRY_COPY.unknownPantry.fil}
          </Text>
          <Text style={[TYPE.small, { color: c.textMuted }]}>{PANTRY_COPY.unknownPantry.en}</Text>
        </View>
      </View>
    );
  }

  const awards = myAwards(feed.views);
  const open = openLots(feed.views);
  const openLot = (v: PantryLotView) =>
    // Typed routes regenerate on the next dev-server start; the cast keeps this compiling until then.
    router.push(`/pantry/lot/${encodeURIComponent(v.lot.id)}?profile=${pantry.id}` as Href);

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <TarpBar clock={clockText(feed.clock)} subtitle={`${pantry.name} · ${pantry.street}`}>
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
            {PANTRY_COPY.home.fil}
          </Text>
          <Text style={[TYPE.small, { color: c.textMuted }]}>{PANTRY_COPY.home.en}</Text>
        </View>

        <View style={[styles.budget, { borderColor: c.zinc }]} accessible accessibilityLabel={`${PANTRY_COPY.budget.line(feed.sharesLeft, SHARE_BUDGET_PER_EVENING)} ${PANTRY_COPY.budget.note}`}>
          <Text style={[TYPE.bodyStrong, { color: c.text }]}>{PANTRY_COPY.budget.line(feed.sharesLeft, SHARE_BUDGET_PER_EVENING)}</Text>
          <Text style={[TYPE.small, { color: c.textMuted }]}>{PANTRY_COPY.budget.note}</Text>
        </View>

        <Section title={PANTRY_COPY.awards} empty={PANTRY_COPY.noAwards} views={awards} onOpen={openLot} />
        <Section title={PANTRY_COPY.open} empty={PANTRY_COPY.noOpen} views={open} onOpen={openLot} />
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  empty,
  views,
  onOpen,
}: {
  title: { fil: string; en: string };
  empty: { fil: string; en: string };
  views: readonly PantryLotView[];
  onOpen: (v: PantryLotView) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={[TYPE.title, { color: c.text }]} accessibilityRole="header">
          {title.fil}
        </Text>
        <Text style={[TYPE.small, { color: c.textMuted }]}>{`${title.en} · ${views.length}`}</Text>
      </View>
      {views.length === 0 ? (
        <View style={[styles.empty, { borderColor: c.zinc }]}>
          <Text style={[TYPE.body, { color: c.text }]}>{empty.fil}</Text>
          <Text style={[TYPE.small, { color: c.textMuted }]}>{empty.en}</Text>
        </View>
      ) : (
        views.map((v) => (
          <View key={v.lot.id}>
            <StallString />
            <PantryTag view={v} onPress={() => onOpen(v)} />
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: SPACE.l, paddingTop: SPACE.xl, paddingBottom: 120, gap: SPACE.xl },
  heading: { gap: 2 },
  section: { gap: SPACE.s },
  budget: { borderWidth: 1.5, borderRadius: 4, padding: SPACE.m, gap: SPACE.xs },
  empty: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 4, padding: SPACE.l, gap: SPACE.s },
});
