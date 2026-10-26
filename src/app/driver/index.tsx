import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bi, DriverChooser, openDirections, RequestCard, RunCard, spoken } from '../../components/driver/DriverCards';
import { SimControl } from '../../components/SimControl';
import { TarpBar } from '../../components/TarpBar';
import { WORLD } from '../../data/dataset';
import { driverBoard, type Ask } from '../../driver/board';
import { chooserLocked, chooserOrder, demoEvening } from '../../driver/chooser';
import { hhmm } from '../../donor/tonight';
import { DRV, splitBi } from '../../i18n/driver';
import { indexWorld } from '../../engine/world';
import { pickRole } from '../../backend/runtime';
import { liveEvening, useLiveSnapshot } from '../../live/useLive';
import { useTheme } from '../../theme/theme';
import { SPACE, TYPE } from '../../theme/tokens';

const WX = indexWorld(WORLD);
/** Asks that have become a run (or a result on the list), as opposed to a request still waiting for an answer. */
const RUN_STATES = new Set<Ask['status']>(['picked', 'not_picked', 'committed', 'delivered', 'withdrawn', 'no_reply', 'cancelled']);

/**
 * The driver's phone (DRV-01 to DRV-06). `?driver=V..` picks the profile this phone holds (decision D-Q5): the engine asks
 * that driver and waits for this screen's answers. The default is the first driver of chooserOrder (the top winner of the
 * no-hold baseline). The chooser locks after 17:00 or while the clock runs. Leaving the screen releases the profile.
 */
export default function DriverHome() {
  const { c } = useTheme();
  const sim = useLiveSnapshot();
  const params = useLocalSearchParams<{ driver?: string }>();
  const drivers = useMemo(() => chooserOrder(demoEvening()), []);
  const locked = chooserLocked(sim);
  const requested = typeof params.driver === 'string' ? params.driver : undefined;
  const selectedId = (requested && WORLD.drivers.some((d) => d.id === requested) ? requested : drivers[0]?.id) ?? null;
  const driver = WORLD.drivers.find((d) => d.id === selectedId) ?? null;

  // Hold the profile while this screen is open. The board is read only once the store reports this driver as held,
  // so a frame never shows requests from an evening where nobody holds the profile. The driver's phone registers for
  // the role with this profile (the schema needs the profile at registration), so the choice is sent when it is made.
  useEffect(() => {
    if (!selectedId) return;
    liveEvening.holdDriver(selectedId);
    pickRole('driver', selectedId).catch((error: unknown) => console.warn('driver: role not set', error));
    return () => liveEvening.holdDriver(null);
  }, [selectedId]);

  const held = liveEvening.heldDriver();
  const lots = new Map(liveEvening.postedLots().map((l) => [l.id, l]));
  const board =
    driver && held === driver.id
      ? driverBoard({ log: liveEvening.visibleLog(), driver, wx: WX, lots, now: sim.minute })
      : null;
  const asks = board?.asks ?? [];
  const requests = asks.filter((a) => a.status === 'asked');
  const runs = asks.filter((a) => RUN_STATES.has(a.status));
  const donorOf = (id: string) => WORLD.donors.find((d) => d.id === id)!;
  const pantryOf = (id: string) => WORLD.pantries.find((p) => p.id === id)!;

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <TarpBar clock={hhmm(sim.minute)} subtitle={driver ? `${driver.name} · ${DRV.title}` : DRV.title}>
        <SimControl
          running={sim.running}
          ended={sim.ended}
          onPress={() => (sim.running ? liveEvening.pause() : liveEvening.start())}
        />
      </TarpBar>
      <ScrollView contentContainerStyle={styles.body}>
        <DriverChooser
          drivers={drivers}
          selectedId={selectedId}
          locked={locked}
          onSelect={(id) => {
            if (!locked) router.setParams({ driver: id });
          }}
        />

        <Heading text={DRV.requests} />
        {board && driver ? (
          requests.length === 0 ? (
            <View style={[styles.empty, { borderColor: c.zinc }]}>
              <Bi text={DRV.requestsEmpty} strong surface="ground" />
              <Bi text={DRV.requestsEmptyHint} tone="muted" surface="ground" />
            </View>
          ) : (
            requests.map((ask) => (
              <RequestCard
                key={`${ask.lot.id}@${ask.askedMinute}`}
                ask={ask}
                now={sim.minute}
                donor={donorOf(ask.lot.donorId)}
                pantry={pantryOf(ask.pantryId)}
                offer={board.offerTrip(ask)}
                onOffer={() => liveEvening.answerDriver(ask.lot.id, driver.id, 'offer')}
                onDecline={() => liveEvening.answerDriver(ask.lot.id, driver.id, 'decline')}
              />
            ))
          )
        ) : null}

        <Heading text={DRV.runs} />
        {board && driver ? (
          runs.length === 0 ? (
            <Bi text={DRV.runsEmpty} tone="muted" surface="ground" />
          ) : (
            runs.map((ask) => (
              <RunCard
                key={`${ask.lot.id}@${ask.askedMinute}`}
                ask={ask}
                now={sim.minute}
                donor={donorOf(ask.lot.donorId)}
                pantry={pantryOf(ask.pantryId)}
                onCommit={() => liveEvening.answerDriver(ask.lot.id, driver.id, 'commit')}
                onWithdraw={() => liveEvening.answerDriver(ask.lot.id, driver.id, 'withdraw')}
                onMaps={() => void openDirections(donorOf(ask.lot.donorId), pantryOf(ask.pantryId))}
              />
            ))
          )
        ) : null}

        <Bi text={DRV.simNote} tone="muted" surface="ground" />
      </ScrollView>
    </View>
  );
}

/** A section heading: the Filipino as the header, the English beneath (CC-05). */
function Heading({ text }: { text: string }) {
  const { c } = useTheme();
  const { fil, en } = splitBi(text);
  return (
    <View style={styles.section} accessibilityRole="header" accessibilityLabel={spoken(text)}>
      <Text style={[TYPE.title, { color: c.text }]}>{fil}</Text>
      {en ? <Text style={[TYPE.small, { color: c.textMuted }]}>{en}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: SPACE.l, paddingTop: SPACE.l, paddingBottom: SPACE.xxl, gap: SPACE.l },
  section: { gap: 2 },
  empty: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 4, padding: SPACE.l, gap: SPACE.s },
});
