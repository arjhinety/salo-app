import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View, Text } from 'react-native';
import { SimControl } from '../../../components/SimControl';
import { Sticker, type StickerKind } from '../../../components/Sticker';
import { TarpBar } from '../../../components/TarpBar';
import { ValueTable } from '../../../components/pantry/ValueTable';
import { PANTRY_COPY } from '../../../i18n/pantry';
import { clockText, whyFill, whySentence } from '../../../pantry/format';
import { lotFacts } from '../../../pantry/lotText';
import type { PantryStatus } from '../../../pantry/model';
import { usePantryFeed } from '../../../pantry/usePantry';
import { liveEvening, useLiveSnapshot } from '../../../live/useLive';
import { useTheme } from '../../../theme/theme';
import { SPACE, TYPE } from '../../../theme/tokens';

const KIND: Record<PantryStatus, StickerKind> = {
  bidding: 'quiet',
  outbid: 'quiet',
  tentative: 'live',
  final: 'done',
  delivered: 'done',
  stranded: 'problem',
  refused: 'problem',
};

/** One lot for the pantry: its facts, its status, the four value parts, and "Why did you get this lot?" (PAN-07). */
export default function PantryLot() {
  const { c } = useTheme();
  const { id, profile } = useLocalSearchParams<{ id: string; profile?: string }>();
  const sim = useLiveSnapshot();
  const feed = usePantryFeed(profile);
  const view = feed.views.find((v) => v.lot.id === id);
  const pantry = feed.pantry;

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace(`/pantry?profile=${pantry?.id ?? ''}` as Href);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <TarpBar clock={clockText(feed.clock)} subtitle={pantry ? `${pantry.name} · ${pantry.street}` : undefined}>
        <SimControl
          running={sim.running}
          ended={sim.ended}
          onPress={() => (sim.running ? liveEvening.pause() : liveEvening.start())}
        />
      </TarpBar>
      <Pressable
        onPress={back}
        accessibilityRole="button"
        accessibilityLabel={`${PANTRY_COPY.back.fil}. ${PANTRY_COPY.back.en}.`}
        style={({ pressed }) => [styles.back, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={[TYPE.bodyStrong, { color: c.text }]}>{`‹ ${PANTRY_COPY.back.fil} · ${PANTRY_COPY.back.en}`}</Text>
      </Pressable>

      {!view || !pantry ? (
        <View style={styles.body}>
          <Text style={[TYPE.title, { color: c.text }]}>{PANTRY_COPY.lotNotFound.fil}</Text>
          <Text style={[TYPE.small, { color: c.textMuted }]}>{PANTRY_COPY.lotNotFound.en}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.heading}>
            <Text style={[TYPE.small, { color: c.textMuted }]}>{PANTRY_COPY.fact.lot(view.lot.id)}</Text>
            <Text style={[TYPE.item, { color: c.text }]} accessibilityRole="header">
              {lotFacts(view).item}
            </Text>
          </View>

          {/* The status and its detail read as one sentence; the sticker is hidden on its own, so the group carries it. */}
          <View
            style={styles.statusRow}
            accessible
            accessibilityLabel={`${PANTRY_COPY.status[view.status].sticker}. ${PANTRY_COPY.status[view.status].detail}`}
            accessibilityLiveRegion="polite"
          >
            <Sticker text={PANTRY_COPY.status[view.status].sticker} kind={KIND[view.status]} />
            <Text style={[TYPE.body, { color: c.text, flexShrink: 1 }]}>{PANTRY_COPY.status[view.status].detail}</Text>
          </View>
          {view.reannounced ? (
            <Text style={[TYPE.body, { color: c.text, borderLeftWidth: 3, borderLeftColor: c.zinc, paddingLeft: SPACE.s }]}>
              {view.status === 'tentative' ? PANTRY_COPY.reannounced.tentative : PANTRY_COPY.reannounced.committed}
            </Text>
          ) : null}

          <View style={styles.facts}>
            <Text style={[TYPE.bodyStrong, { color: c.text }]}>{lotFacts(view).amount}</Text>
            <Text style={[TYPE.body, { color: c.text }]}>{lotFacts(view).storage}</Text>
            <Text style={[TYPE.body, { color: c.text }]}>
              {pantry.hasFridge ? PANTRY_COPY.fridge.pantryHas : PANTRY_COPY.fridge.pantryNone}
            </Text>
            <Text style={[TYPE.body, { color: c.text }]}>{lotFacts(view).pickupBy}</Text>
            <Text style={[TYPE.body, { color: c.text }]}>{lotFacts(view).distance}</Text>
          </View>

          <Text style={[TYPE.title, { color: c.text }]} accessibilityRole="header">
            {PANTRY_COPY.value.heading.fil}
          </Text>
          {view.status === 'refused' ? (
            <View style={[styles.box, { borderColor: c.zinc }]}>
              <Text style={[TYPE.bodyStrong, { color: c.text }]}>{PANTRY_COPY.value.noValue}</Text>
              {view.refuseReason ? (
                <Text style={[TYPE.body, { color: c.text }]}>
                  {`${PANTRY_COPY.refuse[view.refuseReason].fil} · ${PANTRY_COPY.refuse[view.refuseReason].en}`}
                </Text>
              ) : null}
            </View>
          ) : view.bid ? (
            <View style={styles.valueBlock}>
              <ValueTable value={view.bid.value} />
              <Text style={[TYPE.bodyStrong, { color: c.text }]}>{PANTRY_COPY.value.bidShares(view.bid.shares)}</Text>
              <Text style={[TYPE.body, { color: c.text }]}>{PANTRY_COPY.value.sharesLeft(feed.sharesLeft)}</Text>
              <Text style={[TYPE.small, { color: c.textMuted }]}>{`${PANTRY_COPY.budget.note}`}</Text>
              <Text style={[TYPE.small, { color: c.textMuted }]}>{PANTRY_COPY.value.auto}</Text>
            </View>
          ) : (
            <Text style={[TYPE.body, { color: c.textMuted }]}>{PANTRY_COPY.value.noBidYet}</Text>
          )}

          {view.bid && view.status !== 'refused' ? (
            <>
              <Text style={[TYPE.title, { color: c.text }]} accessibilityRole="header">
                {PANTRY_COPY.why.heading}
              </Text>
              <Text style={[TYPE.body, { color: c.text }]}>
                {whySentence(view.status, whyFill(pantry.name, view.bid.value, view.bid.shares, feed.sharesLeft, view.roadKm))}
              </Text>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { minHeight: 48, justifyContent: 'center', paddingHorizontal: SPACE.l },
  body: { paddingHorizontal: SPACE.l, paddingTop: SPACE.m, paddingBottom: 120, gap: SPACE.l },
  heading: { gap: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, flexWrap: 'wrap' },
  facts: { gap: SPACE.xs },
  box: { borderWidth: 1.5, borderRadius: 4, padding: SPACE.m, gap: SPACE.s },
  valueBlock: { gap: SPACE.s },
});
