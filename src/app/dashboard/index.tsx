import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { databaseStatusLine } from '../../backend/outbox';
import { startNewRun, useBackendStatus } from '../../backend/runtime';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EveningRuler } from '../../components/EveningRuler';
import { LotStrip, type StripState } from '../../components/LotStrip';
import { PolicySheet } from '../../components/PolicySheet';
import { ReceiptTape } from '../../components/ReceiptTape';
import { SimControl } from '../../components/SimControl';
import { TarpBar } from '../../components/TarpBar';
import type { LotId, PolicyId } from '../../engine/types';
import { dash } from '../../i18n/strings';
import { cancelledAtMinute, clock24, lotsWithBids, stripState, tapeRows, type TapeRow, WORLD_NAMES } from '../../live/tape';
import { RESULTS_COPY, RESULTS_ROUTE } from '../../results/copy';
import { liveEvening, useLiveSnapshot } from '../../live/useLive';
import { useTheme } from '../../theme/theme';
import { SPACE, TYPE } from '../../theme/tokens';

/** Seconds per simulated minute: 1x is the default 6 s (decision D-k). */
const SPEEDS = [
  { label: '1×', secs: 6 },
  { label: '2×', secs: 3 },
  { label: '4×', secs: 1.5 },
] as const;

/** The live dashboard: the evening as a receipt tape, for the panel. English copy (decision). Simulated data. */
export default function Dashboard() {
  const { c } = useTheme();
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sim = useLiveSnapshot();
  const backend = useBackendStatus();
  const [picked, setPicked] = useState<LotId | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // A refused cancel. Cleared by a replay and by a seek.
  const [refusal, setRefusal] = useState<string | null>(null);

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
      <Text style={[TYPE.chipItem, { color: c.marker }]} numberOfLines={2}>
        {selected.items.map((i) => i.foodItem).join(', ')}
      </Text>
      <Text style={[TYPE.small, { color: c.onKraftMuted }]}>
        {`${WORLD_NAMES.donor(selected.donorId)} · ${selected.items.map((i) => `${i.quantity} ${i.unit}`).join(', ')} · pick up by ${clock24(selected.pickupByMinute)} · ${selected.id}`}
      </Text>
    </View>
  ) : null;

  const emptyText = posted.length === 0 ? dash.noLotYet : selectedId ? dash.tapeEmpty : dash.noLotSelected;
  const stackActions = fontScale >= 1.5;

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

      <EveningRuler minute={sim.minute} postings={posted.map((l) => l.postedMinute)} onSeek={seek} />

      <ReceiptTape key={selectedId ?? 'none'} rows={rows} emptyText={emptyText} header={header} />

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
});
