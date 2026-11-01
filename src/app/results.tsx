import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FROZEN_PARAMS } from '../engine/frozenParams';
import { announcementOf, progressLine, type RunView } from '../results/announce';
import { NOT_MEASURED, RESULTS_COPY as C } from '../results/copy';
import { currentModel, type Row } from '../results/model';
import { keepForSession, RunCancelledError, runOnDevice, sessionResults, type OnDeviceResults } from '../results/onDevice';
import { REGISTRATION } from '../results/registration';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';

/**
 * The Results screen (RES-01 to RES-07), in this order: the gate line, the run block, the verdict with the main
 * comparison on a receipt, its post-hoc note, the supporting sections, the footer, and the four-policy table last.
 * Every number reads "Not measured yet" until the user runs the main evenings on this phone ("Run the main evenings",
 * shown only while the pre-registration gate is open). Until a result is shown, each table is one dashed empty box.
 * The run is the engine over E21 to E64, computed here, yielding to the event loop between runs; leaving the screen
 * cancels it. Only E21 to E64 are named (RES-06). English, simulated data, labelled.
 */
export default function Results() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [results, setResults] = useState<OnDeviceResults | null>(() => sessionResults());
  const [run, setRun] = useState<RunView>({ status: 'idle' });
  const current = useRef<{ cancelled: boolean } | null>(null);
  const m = currentModel(results);

  // Leaving the screen cancels a run in progress: no state is set after unmount, and its results are dropped.
  useEffect(
    () => () => {
      if (current.current) current.current.cancelled = true;
      current.current = null;
    },
    [],
  );

  const start = () => {
    const mine = { cancelled: false };
    current.current = mine;
    setRun({ status: 'running', phase: 'evenings', done: 0, total: REGISTRATION.mainEveningCount ?? 0 });
    runOnDevice({
      params: FROZEN_PARAMS,
      onProgress: (p) => {
        if (!mine.cancelled) setRun({ status: 'running', ...p });
      },
      isCancelled: () => mine.cancelled,
    }).then(
      (out) => {
        if (mine.cancelled) return;
        current.current = null;
        keepForSession(out);
        setResults(out);
        setRun({ status: 'idle' });
      },
      (err: unknown) => {
        if (mine.cancelled) return;
        current.current = null;
        setRun({ status: err instanceof RunCancelledError ? 'cancelled' : 'failed' });
      },
    );
  };

  const cancel = () => {
    if (current.current) current.current.cancelled = true;
    current.current = null;
    setRun({ status: 'cancelled' });
  };

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/dashboard' as Href);
  };

  const running = run.status === 'running' ? run : null;
  const fraction = running ? (running.phase === 'intervals' ? 1 : running.done / running.total) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + SPACE.xxl }}>
        <View style={[styles.band, { backgroundColor: c.tarp, paddingTop: insets.top + SPACE.s }]}>
          <Pressable
            onPress={back}
            accessibilityRole="button"
            accessibilityLabel={C.back}
            style={({ pressed }) => [styles.back, { borderColor: c.onTarp, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[TYPE.bodyStrong, { color: c.onTarp }]}>{C.back}</Text>
          </Pressable>
          <Text style={[TYPE.wordmark, { color: c.onTarp }]} accessibilityRole="header">
            {C.title}
          </Text>
          <Text style={[TYPE.small, { color: c.onTarp }]}>{C.subtitle}</Text>
        </View>

        <View style={styles.content}>
          {/* 1. The gate line, then the run block. */}
          {m.gateLine ? (
            <View style={[styles.paper, { backgroundColor: c.tape, borderColor: c.kraftEdge }]}>
              <Text style={[TYPE.tapeBody, { color: c.onTape }]} accessibilityLiveRegion="polite">
                {m.gateLine}
              </Text>
            </View>
          ) : null}
          <Text style={[TYPE.small, { color: c.textMuted }]}>{C.evenings}</Text>

          {m.canRun ? (
            <View style={styles.run}>
              {running ? (
                <>
                  <Text style={[TYPE.bodyStrong, { color: c.text }]}>{progressLine(running)}</Text>
                  <ProgressBar fraction={fraction} now={running.done} total={running.total} label={progressLine(running)} />
                  <Pressable
                    onPress={cancel}
                    accessibilityRole="button"
                    accessibilityLabel={C.runCancel}
                    style={({ pressed }) => [styles.outline, { borderColor: c.text, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text style={[TYPE.bodyStrong, { color: c.text }]}>{C.runCancel}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    onPress={start}
                    accessibilityRole="button"
                    accessibilityLabel={C.runButton}
                    style={({ pressed }) => [
                      styles.primary,
                      { backgroundColor: c.tarp, borderColor: c.tarpInk, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Text style={[TYPE.bodyStrong, { color: c.onTarp }]}>{C.runButton}</Text>
                  </Pressable>
                  <Text style={[TYPE.small, { color: c.textMuted }]}>{C.runInMemory}</Text>
                </>
              )}
              {/* Only phase changes and every tenth evening are spoken (announce.ts). Visually empty. */}
              <Text accessibilityLiveRegion="polite" style={styles.announcer}>
                {announcementOf(run)}
              </Text>
              {run.status === 'cancelled' ? (
                <Text style={[TYPE.body, { color: c.red }]} accessibilityLiveRegion="polite">
                  {C.runCancelled}
                </Text>
              ) : null}
              {run.status === 'failed' ? (
                <Text style={[TYPE.body, { color: c.red }]} accessibilityLiveRegion="polite">
                  {C.runFailed}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* 2. The verdict (Title role) and the main comparison, on a receipt. The post-hoc note sits under it. */}
          {m.open ? (
            <>
              <View style={[styles.paper, styles.receipt, { backgroundColor: c.tape, borderColor: c.kraftEdge }]}>
                <Text style={[TYPE.title, { color: c.onTape }]} accessibilityRole="header" accessibilityLiveRegion="polite">
                  {m.verdict}
                </Text>
                <Text style={[TYPE.small, { color: c.onTape }]}>{C.mainHeading}</Text>
                {m.mainRows.map((r) => (
                  <RowLine key={r.label} label={r.label} value={r.value} onPaper />
                ))}
              </View>
              {m.postHocNote ? <Text style={[TYPE.small, { color: c.textMuted }]}>{m.postHocNote}</Text> : null}
            </>
          ) : (
            <Section title={C.mainHeading}>
              <Empty />
            </Section>
          )}

          {/* 3. The supporting sections. */}
          <Section title={C.supportingHeading}>
            <Text style={[TYPE.small, { color: c.textMuted }]}>{C.supportingNote}</Text>
            {m.open ? m.supportingRows.map((r) => <RowLine key={r.label} label={r.label} value={r.value} />) : <Empty />}
          </Section>

          <Section title={C.learningHeading}>
            {m.open ? m.learningRows.map((r) => <RowLine key={r.label} label={r.label} value={r.value} />) : <Empty />}
          </Section>

          <Section title={C.ceilingHeading}>
            <Text style={[TYPE.small, { color: c.textMuted }]}>{C.ceilingNote}</Text>
            {m.open ? m.ceilingRows.map((r) => <RowLine key={r.label} label={r.label} value={r.value} />) : <Empty />}
          </Section>

          <Section title="">
            <Text style={[TYPE.small, { color: c.textMuted }]}>{C.method}</Text>
            {m.footer.map((r) => (
              <RowLine key={r.label} label={r.label} value={r.value} />
            ))}
          </Section>

          {/* 4. The four-policy table, last. */}
          <Section title={C.policiesHeading}>
            {m.open ? (
              m.policies.map((p) => (
                <View key={p.id} style={styles.policy} accessible={false}>
                  <Text style={[TYPE.bodyStrong, { color: c.text }]} accessibilityRole="header">
                    {p.label}
                  </Text>
                  {p.cells.map((cell) => (
                    <RowLine key={cell.label} label={cell.label} value={cell.value} />
                  ))}
                </View>
              ))
            ) : (
              <Empty />
            )}
          </Section>
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.section, { borderTopColor: c.rule }]}>
      {title ? (
        <Text style={[TYPE.title, { color: c.text }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** The empty state of a table before a result is shown: one dashed box, zinc outline, one Body Strong line. */
function Empty() {
  const { c } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: c.zinc }]}>
      <Text style={[TYPE.bodyStrong, { color: c.text }]}>{C.emptyTable}</Text>
    </View>
  );
}

/**
 * Progress of the run. The fill is tarp ink (lighter at night, so it shows on the ground). It is a progress bar to
 * TalkBack, with its minimum, maximum and current evening. The fill moves with an animation only when the phone allows
 * motion (reduce motion: it jumps).
 */
function ProgressBar({ fraction, now, total, label }: { fraction: number; now: number; total: number; label: string }) {
  const { c, reduceMotion } = useTheme();
  const [width] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(width, { toValue: fraction, duration: reduceMotion ? 0 : 300, useNativeDriver: false }).start();
  }, [fraction, reduceMotion, width]);
  const fill = width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View
      style={[styles.track, { borderColor: c.text }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: total, now }}
    >
      <Animated.View style={[styles.fill, { backgroundColor: c.tarpInk, width: fill }]} />
    </View>
  );
}

/** One label and value. On the receipt paper both are paper ink. On the ground, "Not measured yet" reads muted. */
function RowLine({ label, value, onPaper = false }: Row & { onPaper?: boolean }) {
  const { c } = useTheme();
  const pending = value === NOT_MEASURED;
  const labelColor = onPaper ? c.onTape : c.textMuted;
  const valueColor = onPaper ? c.onTape : pending ? c.textMuted : c.text;
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[TYPE.small, styles.lineLabel, { color: labelColor }]}>{label}</Text>
      <Text style={[TYPE.bodyStrong, styles.lineValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { paddingHorizontal: SPACE.l, paddingBottom: SPACE.l, gap: SPACE.xs },
  back: {
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: SPACE.m,
    borderWidth: 1.5,
    borderRadius: 4,
    marginBottom: SPACE.s,
  },
  content: { padding: SPACE.l, gap: SPACE.l },
  run: { gap: SPACE.s },
  primary: {
    alignSelf: 'stretch',
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACE.m,
    borderWidth: 2,
    borderRadius: 4,
  },
  outline: {
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: SPACE.m,
    borderWidth: 1.5,
    borderRadius: 4,
  },
  announcer: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  track: { height: 10, borderWidth: 1.5, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%' },
  paper: { borderWidth: 1.5, borderRadius: 4, padding: SPACE.l, gap: SPACE.s },
  receipt: { gap: SPACE.s },
  empty: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 4, padding: SPACE.l },
  section: { borderTopWidth: 1, paddingTop: SPACE.m, gap: SPACE.s },
  policy: { gap: SPACE.xs, paddingBottom: SPACE.s },
  line: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: SPACE.s, minHeight: 28 },
  lineLabel: { flexShrink: 1, flexGrow: 1 },
  lineValue: { textAlign: 'right', flexShrink: 1 },
});
