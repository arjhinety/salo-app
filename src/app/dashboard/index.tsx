import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions, Text } from 'react-native';
import { databaseStatusLine } from '../../backend/outbox';
import { startNewRun, useBackendStatus } from '../../backend/runtime';
import { useDashboardStatus } from '../../backend/useSession';
import { SYNC } from '../../i18n/sync';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EveningRuler } from '../../components/EveningRuler';
import { LotStrip, type StripState } from '../../components/LotStrip';
import { PolicySheet } from '../../components/PolicySheet';
import { BidList } from '../../components/BidList';
import { DriverTrackPanel } from '../../components/DriverTrackPanel';
import { MapPanel } from '../../components/MapPanel';
import { ReceiptTape } from '../../components/ReceiptTape';
import { SimControl } from '../../components/SimControl';
import { TarpBar } from '../../components/TarpBar';
import { WORLD } from '../../data/dataset';
import type { LotId, PolicyId } from '../../engine/types';
import { dash } from '../../i18n/strings';
import { bidRows } from '../../live/bids';
import { driverTrack } from '../../live/drivers';
import { cancelledAtMinute, clock24, lotsWithBids, stripState, tapeRows, type TapeRow, WORLD_NAMES } from '../../live/tape';
import { placesInvolved, routeLegs } from '../../live/schematic';
import { RESULTS_COPY, RESULTS_ROUTE } from '../../results/copy';
import { liveEvening, useLiveSnapshot } from '../../live/useLive';
import { useTheme } from '../../theme/theme';
import { SPACE, TYPE } from '../../theme/tokens';

/** Seconds per simulated minute: 1x is the default 6 s (decision D-k). */
/** At this font scale (200% is 2) the ruler and tabs scroll, so the tape keeps a readable height. */
const LARGE_TEXT = 1.5;
/** Share of the window height the tape takes when the top scrolls. */
const TAPE_SHARE = 0.55;

const SPEEDS = [
  { label: '1×', secs: 6 },
  { label: '2×', secs: 3 },
  { label: '4×', secs: 1.5 },
] as const;

/** The live dashboard: the evening as a receipt tape, for the panel. English copy (decision). Simulated data. */
export default function Dashboard() {
  const { c } = useTheme();
  const { fontScale, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sim = useLiveSnapshot();
  const backend = useBackendStatus();
  const session = useDashboardStatus();
  const [picked, setPicked] = useState<LotId | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // A refused cancel. Cleared by a replay and by a seek.
  const [refusal, setRefusal] = useState<string | null>(null);
  // Which view the body shows under the ruler. The tape is the default; the others read the same visible log.
  const [view, setView] = useState<DashView>('tape');

  // Everything below is a fold of the store's visible state. The store caches the log, so re-deriving per publish is cheap.
  const posted = liveEvening.postedLots();
  const log = liveEvening.visibleLog();
  // The default selection is the most recently posted lot. Once the panel picks one, it stays picked.
  const selectedId: LotId | null =
    picked !== null && posted.some((l) => l.id === picked) ? picked : (posted[posted.length - 1]?.id ?? null);
  const selected = posted.find((l) => l.id === selectedId) ?? null;
  const selState = selectedId ? liveEvening.stateOf(selectedId) : undefined;
  const bidLots = lotsWithBids(log);
  // The status line is the cancel's own event: it shows only while the clock is at or after that cancel, so a rewind
  // or a seek before it clears it without any extra state.
  const cancelMinute = selectedId ? cancelledAtMinute(liveEvening.inputLog(), selectedId, sim.minute) : null;
  const status = refusal ?? (cancelMinute !== null ? dash.cancelledStatus(clock24(cancelMinute)) : null);
  const rows: TapeRow[] = selectedId ? tapeRows(log, selectedId, selState, sim.minute) : [];
  const canCancel = selState === 'final';
  const stripStateOf = (id: LotId): StripState => stripState(liveEvening.stateOf(id), bidLots.has(id));
  const stateOfLot = (id: LotId) => liveEvening.stateOf(id);
  const bids = view === 'bids' && selected ? bidRows(log, { id: selected.id, donorId: selected.donorId }, sim.policy) : [];
  const places = view === 'map' || view === 'drivers' ? placesInvolved(log, posted, stateOfLot) : [];
  const routes = view === 'map' ? routeLegs(log, posted, stateOfLot) : [];
  const tracks = places.flatMap((r) => {
    const d = r.kind === 'driver' ? WORLD.drivers.find((x) => x.id === r.id) : undefined;
    return d ? [driverTrack(d)] : [];
  });

  const togglePlay = () => (sim.running ? liveEvening.pause() : liveEvening.start());
  const cancelDriver = () => {
    if (!selectedId) return;
    const r = liveEvening.cancelDriver(selectedId);
    setRefusal(r.ok ? null : dash.cancelRefused);
  };
  const replayUnder = (p: PolicyId) => {
    setSheetOpen(false);
    setRefusal(null);
    // A replay is a new run in the database: the current session ends and the replayed run gets its own.
    startNewRun();
    liveEvening.replayUnder(p);
  };
  const seek = (m: number) => {
    setRefusal(null);
    liveEvening.seek(m);
  };

  const header = selected ? (
    <View style={[styles.tag, { backgroundColor: c.kraft, borderColor: c.kraftEdge }]}>
      <Text style={[TYPE.chipItem, { color: c.marker }]}>
        {selected.items.map((i) => i.foodItem).join(', ')}
      </Text>
      <Text style={[TYPE.small, { color: c.onKraftMuted }]}>
        {`${WORLD_NAMES.donor(selected.donorId)} · ${selected.items.map((i) => `${i.quantity} ${i.unit}`).join(', ')} · pick up by ${clock24(selected.pickupByMinute)} · ${selected.id}`}
      </Text>
    </View>
  ) : null;

  const emptyText = posted.length === 0 ? dash.noLotYet : selectedId ? dash.tapeEmpty : dash.noLotSelected;
  const stackActions = fontScale >= 1.5;

  const top = (
    <>
      {sim.policy !== 'salo' ? (
        <View style={[styles.replayNote, { backgroundColor: c.groundRaised, borderBottomColor: c.rule }]}>
          <Text style={[TYPE.small, { color: c.text }]} accessibilityRole="text">
            {dash.replayNote}
          </Text>
        </View>
      ) : null}

      <Text style={[TYPE.small, styles.backend, { color: c.textMuted }]} accessibilityLiveRegion="polite">
        {databaseStatusLine(backend)}
      </Text>

      <View style={[styles.code, { borderColor: c.rule }]}>
        <Text style={[TYPE.small, { color: c.textMuted }]}>{SYNC.dashboard.codeLabel}</Text>
        <Text
          style={[TYPE.title, styles.codeText, { color: c.text }]}
          accessibilityRole="text"
          accessibilityLabel={session.joinCode ? `${SYNC.dashboard.codeLabel}: ${session.joinCode.split('').join(' ')}` : SYNC.dashboard.codeWaiting}
        >
          {session.joinCode ?? '······'}
        </Text>
        <Text style={[TYPE.small, { color: c.textMuted }]}>
          {session.joinCode ? SYNC.dashboard.codeHint : SYNC.dashboard.codeWaiting}
        </Text>
        {session.warning ? (
          <Text style={[TYPE.small, { color: c.red }]} accessibilityLiveRegion="polite">
            {SYNC.dashboard.warning(session.warning)}
          </Text>
        ) : null}
      </View>

      <EveningRuler minute={sim.minute} postings={posted.map((l) => l.postedMinute)} onSeek={seek} />

      <ViewChoice current={view} onPick={setView} />

    </>
  );
  const body = (
    <>
      {view === 'tape' ? (
        <ReceiptTape key={selectedId ?? 'none'} rows={rows} emptyText={emptyText} header={header} />
      ) : view === 'bids' ? (
        <View style={styles.body}>
          {header ? <View style={[styles.bodyHeader, { backgroundColor: c.tape }]}>{header}</View> : null}
          {selected ? (
            <BidList rows={bids} policy={sim.policy} />
          ) : (
            <View style={[styles.body, { backgroundColor: c.tape }]}>
              <Text style={[TYPE.tapeBody, styles.bodyHeader, { color: c.onTape }]}>{emptyText}</Text>
            </View>
          )}
        </View>
      ) : view === 'map' ? (
        <View style={styles.body}>
          <MapPanel places={places} routes={routes} />
        </View>
      ) : (
        <View style={styles.body}>
          <DriverTrackPanel tracks={tracks} />
        </View>
      )}

    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <TarpBar
        english
        clock={clock24(sim.minute)}
        subtitle={dash.policyLine(dash.policies[sim.policy].name)}
        chip={{ text: `E05 · ${dash.simulated}`, label: `${dash.simulatedA11y}, evening E05` }}
      >
        <View style={styles.controls}>
          <SimControl english running={sim.running} ended={sim.ended} onPress={togglePlay} />
          <SpeedChoice current={sim.secondsPerMinute} onPick={(secs) => liveEvening.setSpeed(secs)} />
          <Pressable
            onPress={() => router.push(RESULTS_ROUTE as Href)}
            accessibilityRole="link"
            accessibilityLabel={RESULTS_COPY.link}
            style={({ pressed }) => [styles.resultsLink, { borderColor: c.onTarp, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[TYPE.bodyStrong, { color: c.onTarp }]}>{RESULTS_COPY.link}</Text>
          </Pressable>
        </View>
      </TarpBar>

      {fontScale >= LARGE_TEXT ? (
        // At 150% font scale and above the ruler and view tabs scroll above a fixed-height tape, so the tape stays readable.
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {top}
          <View style={{ height: Math.round(height * TAPE_SHARE) }}>{body}</View>
        </ScrollView>
      ) : (
        <>
          {top}
          {body}
        </>
      )}

      <View style={[styles.dock, { backgroundColor: c.ground, borderTopColor: c.rule, paddingBottom: insets.bottom + SPACE.s }]}>
        <LotStrip lots={posted} stateOf={stripStateOf} selectedId={selectedId} onSelect={setPicked} />
        {status ? (
          <Text style={[TYPE.small, styles.status, { color: c.text }]} accessibilityLiveRegion="polite">
            {status}
          </Text>
        ) : null}
        <View style={[styles.actions, { flexDirection: stackActions ? 'column' : 'row' }]}>
          <Pressable
            onPress={cancelDriver}
            disabled={!canCancel}
            accessibilityRole="button"
            accessibilityLabel={dash.cancelDriver}
            accessibilityHint={canCancel ? dash.cancelHint : dash.cancelDisabledHint}
            accessibilityState={{ disabled: !canCancel }}
            style={({ pressed }) => [
              styles.action,
              { borderColor: canCancel ? c.red : c.zinc, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[TYPE.bodyStrong, { color: canCancel ? c.red : c.textMuted }]}>{dash.cancelDriver}</Text>
          </Pressable>
          <Pressable
            onPress={() => setSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={dash.replay}
            style={({ pressed }) => [styles.action, styles.filled, { backgroundColor: c.tarp, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[TYPE.bodyStrong, { color: c.onTarp }]}>{dash.replay}</Text>
          </Pressable>
        </View>
      </View>

      <PolicySheet visible={sheetOpen} current={sim.policy} onPick={replayUnder} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

const VIEWS = ['tape', 'bids', 'map', 'drivers'] as const;
type DashView = (typeof VIEWS)[number];

/** The four views of the body: the tape, the bids for the selected lot, the map of tonight, the driver track record. */
function ViewChoice({ current, onPick }: { current: DashView; onPick: (v: DashView) => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.views} accessibilityRole="radiogroup" accessibilityLabel={dash.viewsLabel}>
      {VIEWS.map((v) => {
        const on = v === current;
        return (
          <Pressable
            key={v}
            onPress={() => onPick(v)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={dash.viewA11y(dash.views[v])}
            style={({ pressed }) => [
              styles.viewBtn,
              { borderColor: c.text, backgroundColor: on ? c.selectFill : 'transparent', opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[TYPE.bodyStrong, { color: on ? c.onSelect : c.text }]}>{dash.views[v]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Three speeds as a radio group on the tarp. The chosen one is filled. */
function SpeedChoice({ current, onPick }: { current: number; onPick: (secs: number) => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.speed} accessibilityRole="radiogroup">
      <Text style={[TYPE.small, { color: c.onTarp }]}>{dash.speed}</Text>
      {SPEEDS.map((s) => {
        const on = s.secs === current;
        return (
          <Pressable
            key={s.label}
            onPress={() => onPick(s.secs)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={dash.speedA11y(s.label, s.secs)}
            style={({ pressed }) => [
              styles.speedBtn,
              { borderColor: c.onTarp, backgroundColor: on ? c.onTarp : 'transparent', opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[TYPE.bodyStrong, { color: on ? c.tarp : c.onTarp }]}>{s.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACE.m },
  speed: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, flexWrap: 'wrap' },
  speedBtn: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.s,
    borderWidth: 1.5,
    borderRadius: 4,
  },
  resultsLink: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: SPACE.m,
    borderWidth: 1.5,
    borderRadius: 4,
  },
  tag: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderWidth: 1.5,
    borderRadius: 4,
    paddingHorizontal: SPACE.m,
    paddingVertical: SPACE.s,
    gap: 2,
    marginBottom: SPACE.s,
  },
  replayNote: { borderBottomWidth: 1, paddingHorizontal: SPACE.l, paddingVertical: SPACE.s },
  backend: { paddingHorizontal: SPACE.l, paddingTop: SPACE.xs },
  code: { marginHorizontal: SPACE.l, marginTop: SPACE.xs, borderWidth: 1, borderRadius: 4, padding: SPACE.s, gap: 2 },
  codeText: { letterSpacing: 6 },
  body: { flex: 1 },
  bodyHeader: { paddingHorizontal: SPACE.l, paddingTop: SPACE.s },
  views: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s, paddingHorizontal: SPACE.l, marginTop: SPACE.xs },
  viewBtn: {
    flexGrow: 1,
    minWidth: 88,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.s,
    borderWidth: 1.5,
    borderRadius: 4,
  },
  dock: { borderTopWidth: 1, paddingTop: SPACE.s, gap: SPACE.s },
  status: { paddingHorizontal: SPACE.l },
  actions: { paddingHorizontal: SPACE.l, gap: SPACE.s },
  action: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.m,
    borderWidth: 1.5,
    borderRadius: 4,
  },
  filled: { borderWidth: 0 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
});
