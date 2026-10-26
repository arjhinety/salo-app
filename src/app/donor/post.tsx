import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DraftCards } from '../../components/DraftCards';
import { MicIcon } from '../../components/icons';
import { TarpBar } from '../../components/TarpBar';
import { parseAuthHeaders } from '../../backend/supabase';
import { PARSE_BASE_URL, PARSE_TIMEOUT_MS } from '../../config/server';
import { EVENINGS } from '../../data/dataset';
import { CATALOG, catalogKey, type CatalogEntry } from '../../donor/catalog';
import {
  applyParse,
  canPostLines,
  lineFromEntry,
  lineKey,
  pickupFromParse,
  pickupOptions,
  readyItems,
  type DraftLine,
  type PickupDecision,
} from '../../donor/fromParsed';
import {
  donorItemKeys,
  lotDrafts,
  MAX_DRAFT_ITEMS,
  splitPicker,
  submitLots,
  type PostGuard,
} from '../../donor/postForm';
import { hhmm } from '../../donor/tonight';
import { parseMessage } from '../../parse/client';
import type { ParsedDraft } from '../../parse/types';
import type { Minute } from '../../engine/types';
import { liveEvening, useLiveSnapshot } from '../../live/useLive';
import { S } from '../../i18n/strings';
import { useTheme } from '../../theme/theme';
import { SPACE, TYPE } from '../../theme/tokens';
import { joinTranscript } from '../../voice/speechLogic';
import { voiceStrings } from '../../voice/strings';
import { useSpeech } from '../../voice/useSpeech';

/** The stall on this phone (D01), as on the donor home. */
const DONOR = 'D01';
/** The picker order: the items this donor has posted in any evening come first. Computed once. */
const PICKER = splitPicker(CATALOG, donorItemKeys(EVENINGS, DONOR));

/**
 * The post flow. The donor types or speaks what is left, sends it, and the parse (the LLM proxy, or the rule-based
 * fallback) fills the cards. Each card is confirmed or fixed, then "Tama, i-post" posts one lot per card. Nothing posts
 * without that tap (DON-02, D-17). The manual picker below adds or fixes items.
 */
export default function Post() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const sim = useLiveSnapshot();
  const speech = useSpeech();
  const [text, setText] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pickupState, setPickupState] = useState<PickupDecision>({ extra: null, chosen: null, ask: false });
  const [parseSource, setParseSource] = useState<'llm' | 'fallback' | null>(null);
  const [parsing, setParsing] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Set once the post has gone through, so a second tap cannot post the same cards again. */
  const guard = useRef<PostGuard>({ posted: false });
  /** The typed text when a voice session started; the transcript is appended to it. */
  const voiceBase = useRef('');
  /** False after unmount, so a parse that finishes late does not set state on a screen that is gone. */
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The transcript fills the text box, editable. Nothing parses until the donor taps send (DON-06).
  useEffect(() => {
    if (speech.transcript) setText(joinTranscript(voiceBase.current, speech.transcript));
  }, [speech.transcript]);

  // The chips follow the clock and the parsed pickup time. Without a valid parsed time, the donor must choose (DON-03).
  const choices = pickupOptions(sim.minute, pickupState.extra);
  const pickup: Minute | null =
    pickupState.chosen !== null && choices.includes(pickupState.chosen)
      ? pickupState.chosen
      : pickupState.ask
        ? null
        : (choices[0] ?? null);
  const picked = new Set(lines.map(lineKey).filter((k): k is string => k !== null));
  const full = lines.length >= MAX_DRAFT_ITEMS;
  const canPost = canPostLines(lines, pickup);
  const ids = liveEvening.nextLiveIds(lines.length);

  const update = (next: DraftLine[]) => {
    setLines(next);
    setFailed(false);
  };

  const addItem = (entry: CatalogEntry) => {
    if (full || picked.has(catalogKey(entry.foodItem, entry.unit))) return;
    update([...lines, lineFromEntry(entry)]);
  };

  const onMic = () => {
    if (speech.listening) {
      speech.stop();
      return;
    }
    voiceBase.current = text.trim();
    void speech.start();
  };

  const onSend = async () => {
    const message = text.trim();
    if (message.length === 0 || parsing) return;
    if (speech.listening) speech.stop();
    const clock = sim.minute;
    setParsing(true);
    const headers = await parseAuthHeaders();
    const draft: ParsedDraft = await parseMessage(message, { baseUrl: PARSE_BASE_URL, timeoutMs: PARSE_TIMEOUT_MS, headers });
    if (!alive.current) return;
    setParsing(false);
    setLines((prev) => applyParse(prev, draft));
    setParseSource(draft.source);
    setPickupState(pickupFromParse(draft.pickupByMinute, clock));
    setFailed(false);
  };

  const onPost = () => {
    if (!canPost || pickup === null) return;
    const result = submitLots(liveEvening, lotDrafts(readyItems(lines), DONOR, pickup), guard.current);
    if (result.status === 'posted') router.back();
    else if (result.status === 'problems') setFailed(true);
  };

  const chip = (entry: CatalogEntry) => {
    const selected = picked.has(catalogKey(entry.foodItem, entry.unit));
    const disabled = !selected && full;
    const showEn = entry.foodItemFil !== entry.foodItem;
    return (
      <Pressable
        key={catalogKey(entry.foodItem, entry.unit)}
        onPress={selected ? undefined : () => addItem(entry)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled }}
        accessibilityLabel={S.postForm.addA11y(entry.foodItemFil, entry.foodItem)}
        style={({ pressed }) => [
          styles.chip,
          {
            backgroundColor: selected ? c.tarp : c.groundRaised,
            borderColor: selected ? c.tarp : c.rule,
            opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text style={[TYPE.bodyStrong, { color: selected ? c.onTarp : c.text }]}>{entry.foodItemFil}</Text>
        {showEn ? <Text style={[TYPE.small, { color: selected ? c.onTarp : c.textMuted }]}>{entry.foodItem}</Text> : null}
      </Pressable>
    );
  };

  const voiceError = speech.error ? voiceStrings.errors[speech.error] : null;
  const sendDisabled = text.trim().length === 0 || parsing;

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <TarpBar clock={hhmm(sim.minute)} subtitle={`${S.post.fil} · ${S.post.en}`} />
      {/* The bottom inset keeps the last content (the post button, after scrolling) clear of the Android gesture bar. */}
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: SPACE.l + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text nativeID="msgLabel" style={[TYPE.title, { color: c.text }]}>
          {S.postScreen.question}
        </Text>
        <Text style={[TYPE.small, { color: c.textMuted }]}>{S.postScreen.example}</Text>
        <View style={[styles.box, { backgroundColor: c.groundRaised, borderColor: c.rule }]}>
          <TextInput
            accessibilityLabelledBy="msgLabel"
            multiline
            value={text}
            onChangeText={setText}
            placeholder={S.postScreen.placeholder}
            placeholderTextColor={c.textMuted}
            style={[TYPE.body, styles.input, { color: c.text }]}
            selectionColor={c.tarp}
            cursorColor={c.tarp}
          />
          <Pressable
            onPress={onMic}
            disabled={!speech.hasModule}
            accessibilityRole="button"
            accessibilityState={{ disabled: !speech.hasModule, busy: speech.listening }}
            accessibilityLabel={speech.listening ? voiceStrings.stop : voiceStrings.tapToSpeak}
            style={({ pressed }) => [styles.mic, { borderColor: speech.listening ? c.tarp : c.rule, opacity: !speech.hasModule ? 0.4 : pressed ? 0.7 : 1 }]}
          >
            <MicIcon color={speech.listening ? c.tarp : c.textMuted} />
          </Pressable>
        </View>
        <Text style={[TYPE.small, { color: c.textMuted }]} accessibilityLiveRegion="polite">
          {speech.listening ? voiceStrings.listening : speech.hasModule ? voiceStrings.tapToSpeak : voiceStrings.needsAppBuild}
        </Text>
        {voiceError ? (
          <Text style={[TYPE.small, { color: c.red }]} accessibilityLiveRegion="polite">
            {voiceError}
          </Text>
        ) : null}

        <Pressable
          onPress={onSend}
          disabled={sendDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: sendDisabled, busy: parsing }}
          accessibilityLabel={parsing ? S.parsePost.sending : S.parsePost.send}
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: sendDisabled ? c.rule : c.tarp, opacity: pressed && !sendDisabled ? 0.88 : 1 },
          ]}
        >
          {parsing ? <ActivityIndicator color={c.onTarp} /> : null}
          <Text style={[TYPE.bodyStrong, { color: sendDisabled ? c.textMuted : c.onTarp }]}>
            {parsing ? S.parsePost.sending : S.parsePost.send}
          </Text>
        </Pressable>

        {parseSource === 'fallback' ? (
          <View style={[styles.banner, { backgroundColor: c.tape, borderColor: c.kraftEdge }]} accessibilityRole="alert">
            <Text style={[TYPE.bodyStrong, { color: c.onTape }]}>{S.parsePost.fallbackBanner}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          {lines.length > 0 ? (
            <DraftCards lines={lines} onChange={update} />
          ) : parseSource !== null ? (
            <Text style={[TYPE.body, { color: c.textMuted }]}>{S.parsePost.noItems}</Text>
          ) : (
            <Text style={[TYPE.body, { color: c.textMuted }]}>{S.postForm.noItems}</Text>
          )}

          <Text style={[TYPE.bodyStrong, { color: c.text }]}>{S.postForm.pickupLabel}</Text>
          {choices.length === 0 ? (
            <Text style={[TYPE.body, { color: c.text }]} accessibilityLiveRegion="polite">
              {S.postForm.pickupClosed}
            </Text>
          ) : (
            <>
              <View style={styles.chips} accessibilityRole="radiogroup">
                {choices.map((m) => {
                  const selected = m === pickup;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setPickupState((s) => ({ ...s, chosen: m, ask: false }))}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={S.postForm.pickupChip(hhmm(m))}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          backgroundColor: selected ? c.tarp : c.groundRaised,
                          borderColor: selected ? c.tarp : c.rule,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}
                    >
                      <Text style={[TYPE.bodyStrong, { color: selected ? c.onTarp : c.text }]}>
                        {S.postForm.pickupChip(hhmm(m))}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {pickup === null && pickupState.ask ? (
                <Text style={[TYPE.body, { color: c.red }]} accessibilityLiveRegion="polite">
                  {S.parsePost.pickupAsk}
                </Text>
              ) : null}
              <Text style={[TYPE.small, { color: c.textMuted }]}>{S.postForm.pickupNote}</Text>
            </>
          )}

          {canPost ? <Text style={[TYPE.bodyStrong, { color: c.text }]}>{S.postForm.becomes(ids)}</Text> : null}
          <Pressable
            onPress={onPost}
            disabled={!canPost}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canPost }}
            accessibilityLabel={S.postForm.post}
            style={({ pressed }) => [
              styles.post,
              { backgroundColor: canPost ? c.tarp : c.rule, opacity: pressed && canPost ? 0.88 : 1 },
            ]}
          >
            <Text style={[TYPE.bodyStrong, { color: canPost ? c.onTarp : c.textMuted }]}>{S.postForm.post}</Text>
          </Pressable>
          {lines.length === 0 ? <Text style={[TYPE.small, { color: c.textMuted }]}>{S.postForm.pickFirst}</Text> : null}
          {lines.length > 0 && !canPost ? <Text style={[TYPE.small, { color: c.text }]}>{S.parsePost.fixFirst}</Text> : null}
          {failed ? (
            <Text style={[TYPE.body, { color: c.red }]} accessibilityLiveRegion="polite">
              {S.postForm.problems}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={[TYPE.title, { color: c.text }]} accessibilityRole="header">
            {S.postForm.heading}
          </Text>
          <Text style={[TYPE.small, { color: c.textMuted }]}>{S.postForm.hint}</Text>

          {PICKER.mine.length > 0 ? (
            <>
              <Text style={[TYPE.small, { color: c.textMuted }]}>{S.postForm.fromBefore}</Text>
              <View style={styles.chips}>{PICKER.mine.map(chip)}</View>
            </>
          ) : null}
          <Text style={[TYPE.small, { color: c.textMuted }]}>{S.postForm.others}</Text>
          <View style={styles.chips}>{PICKER.others.map(chip)}</View>
          {full ? <Text style={[TYPE.small, { color: c.text }]}>{S.postForm.full}</Text> : null}
        </View>

        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Bumalik"
          style={({ pressed }) => [styles.back, { borderColor: c.tarp, opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={[TYPE.bodyStrong, { color: c.tarp }]}>{S.postScreen.back}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: SPACE.l, gap: SPACE.s },
  box: {
    marginTop: SPACE.m,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: SPACE.s,
    gap: SPACE.s,
  },
  input: { flex: 1, minHeight: 96, textAlignVertical: 'top', padding: SPACE.s },
  mic: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  send: {
    minHeight: 56,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.s,
    paddingHorizontal: SPACE.xl,
    marginTop: SPACE.s,
  },
  banner: { borderWidth: 1, borderRadius: 8, padding: SPACE.m },
  section: { marginTop: SPACE.xl, gap: SPACE.m },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s },
  chip: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SPACE.m,
    paddingVertical: SPACE.s,
    justifyContent: 'center',
  },
  post: {
    minHeight: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
  },
  back: {
    marginTop: SPACE.xl,
    minHeight: 48,
    borderWidth: 2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: SPACE.xl,
  },
});
