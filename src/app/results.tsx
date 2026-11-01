import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FROZEN_PARAMS } from '../engine/frozenParams';
import { NOT_MEASURED, RESULTS_COPY as C } from '../results/copy';
import { currentModel, type Row } from '../results/model';
import { keepForSession, RunCancelledError, runOnDevice, sessionResults, type OnDeviceResults, type RunProgress } from '../results/onDevice';
import { REGISTRATION } from '../results/registration';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';

/** The run as the screen shows it. The numbers stay in memory for this session (onDevice.ts keepForSession). */
type RunState =
  | { status: 'idle' }
  | ({ status: 'running' } & RunProgress)
  | { status: 'cancelled' }
  | { status: 'failed' };

/**
 * The Results screen (RES-01 to RES-07). Every number reads "Not measured yet" until the user runs the main evenings on
 * this phone ("Run the main evenings", shown only while the pre-registration gate is open). The run is the engine over
 * E21 to E64, computed here, yielding to the event loop between runs; leaving the screen cancels it. Only E21 to E64 are
 * named (RES-06). English, simulated data, labelled.
 */
export default function Results() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [results, setResults] = useState<OnDeviceResults | null>(() => sessionResults());
  const [run, setRun] = useState<RunState>({ status: 'idle' });
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

  const fraction = run.status === 'running' ? (run.phase === 'intervals' ? 1 : run.done / run.total) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
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

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.xxl }]}>
        {m.gateLine ? (
          <View style={[styles.paper, { backgroundColor: c.tape, borderColor: c.kraftEdge }]}>
            <Text style={[TYPE.tapeBody, { color: c.onTape }]} accessibilityLiveRegion="polite">
              {m.gateLine}
            </Text>
          </View>
        ) : null}
        <Text style={[TYPE.small, { color: c.textMuted }]}>{C.evenings}</Text>

        {m.canRun ? (
          <Section title="">
            {run.status === 'running' ? (
              <>
                <Text style={[TYPE.bodyStrong, { color: c.text }]} accessibilityLiveRegion="polite">
                  {run.phase === 'evenings' ? C.runProgress(run.done, run.total) : C.runIntervals}
                </Text>
                <ProgressBar fraction={fraction} />
                <Pressable
                  onPress={cancel}
                  accessibilityRole="button"
                  accessibilityLabel={C.runCancel}
                  style={({ pressed }) => [styles.button, { borderColor: c.text, opacity: pressed ? 0.7 : 1 }]}
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
                  style={({ pressed }) => [styles.button, { borderColor: c.tarp, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={[TYPE.bodyStrong, { color: c.tarp }]}>{C.runButton}</Text>
                </Pressable>
                <Text style={[TYPE.small, { color: c.textMuted }]}>{C.runInMemory}</Text>
              </>
            )}
            {run.status === 'cancelled' ? (
              <Text style={[TYPE.small, { color: c.text }]} accessibilityLiveRegion="polite">
                {C.runCancelled}
              </Text>
            ) : null}
            {run.status === 'failed' ? (
              <Text style={[TYPE.small, { color: c.text }]} accessibilityLiveRegion="polite">
                {C.runFailed}
              </Text>
            ) : null}
          </Section>
        ) : null}

        <Section title={C.policiesHeading}>
          {m.policies.map((p) => (
            <View key={p.id} style={styles.policy} accessible={false}>
              <Text style={[TYPE.bodyStrong, { color: c.text }]} accessibilityRole="header">
                {p.label}
              </Text>
              {p.cells.map((cell) => (
                <RowLine key={cell.label} label={cell.label} value={cell.value} />
              ))}
            </View>
          ))}
        </Section>

        <Section title={C.mainHeading}>
          {m.mainRows.map((r) => (
            <RowLine key={r.label} label={r.label} value={r.value} />
          ))}
        </Section>

        <Section title={C.verdictHeading}>
          <Text
            style={[TYPE.bodyStrong, { color: m.verdict === NOT_MEASURED ? c.textMuted : c.text }]}
            accessibilityLiveRegion="polite"
          >
            {m.verdict}
          </Text>
          {m.postHocNote ? <Text style={[TYPE.small, { color: c.textMuted }]}>{m.postHocNote}</Text> : null}
        </Section>

        <Section title={C.supportingHeading}>
          <Text style={[TYPE.small, { color: c.textMuted }]}>{C.supportingNote}</Text>
          {m.supportingRows.map((r) => (
            <RowLine key={r.label} label={r.label} value={r.value} />
          ))}
        </Section>

        <Section title={C.learningHeading}>
          {m.learningRows.map((r) => (
            <RowLine key={r.label} label={r.label} value={r.value} />
          ))}
        </Section>

        <Section title={C.ceilingHeading}>
          <Text style={[TYPE.small, { color: c.textMuted }]}>{C.ceilingNote}</Text>
          {m.ceilingRows.map((r) => (
            <RowLine key={r.label} label={r.label} value={r.value} />
          ))}
        </Section>

        <Section title="">
          <Text style={[TYPE.small, { color: c.textMuted }]}>{C.method}</Text>
          {m.footer.map((r) => (
            <RowLine key={r.label} label={r.label} value={r.value} />
          ))}
        </Section>
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

/** Progress of the run. The fill moves with an animation only when the phone allows motion (reduce motion: it jumps). */
function ProgressBar({ fraction }: { fraction: number }) {
  const { c, reduceMotion } = useTheme();
  const [width] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(width, { toValue: fraction, duration: reduceMotion ? 0 : 300, useNativeDriver: false }).start();
  }, [fraction, reduceMotion, width]);
  const fill = width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={[styles.track, { borderColor: c.text }]} accessible={false}>
      <Animated.View style={[styles.fill, { backgroundColor: c.tarp, width: fill }]} />
    </View>
  );
}

/** One label and value. The value reads "Not measured yet" in the muted colour until a run is shown. */
function RowLine({ label, value }: Row) {
  const { c } = useTheme();
  const pending = value === NOT_MEASURED;
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[TYPE.small, styles.lineLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[TYPE.bodyStrong, styles.lineValue, { color: pending ? c.textMuted : c.text }]}>{value}</Text>
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
  button: {
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: SPACE.m,
    borderWidth: 1.5,
    borderRadius: 4,
  },
  track: { height: 10, borderWidth: 1.5, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%' },
  content: { padding: SPACE.l, gap: SPACE.l },
  paper: { borderWidth: 1.5, borderRadius: 4, padding: SPACE.l },
  section: { borderTopWidth: 1, paddingTop: SPACE.m, gap: SPACE.s },
  policy: { gap: SPACE.xs, paddingBottom: SPACE.s },
  line: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: SPACE.s, minHeight: 28 },
  lineLabel: { flexShrink: 1, flexGrow: 1 },
  lineValue: { textAlign: 'right', flexShrink: 1 },
});
