import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DraftCards } from '../../components/DraftCards';
import { MicIcon } from '../../components/icons';
import { TarpBar } from '../../components/TarpBar';
import { EVENINGS } from '../../data/dataset';
import { CATALOG, catalogKey, type CatalogEntry } from '../../donor/catalog';
import {
  donorItemKeys,
  lotDrafts,
  MAX_DRAFT_ITEMS,
  newDraftItem,
  pickupChoices,
  splitPicker,
  submitLots,
  type DraftItem,
  type PostGuard,
} from '../../donor/postForm';
import { hhmm } from '../../donor/tonight';
import type { Minute } from '../../engine/types';
import { liveEvening, useLiveSnapshot } from '../../live/useLive';
import { S } from '../../i18n/strings';
import { useTheme } from '../../theme/theme';
import { SPACE, TYPE } from '../../theme/tokens';

/** The stall on this phone (D01), as on the donor home. */
const DONOR = 'D01';
/** The picker order: the items this donor has posted in any evening come first. Computed once. */
const PICKER = splitPicker(CATALOG, donorItemKeys(EVENINGS, DONOR));

/**
 * The post flow. The text box and the mic are the M2 shell and stay as they are (parsing is M4). Below them, the
 * manual form: pick items, set amounts, choose a pickup time, check the cards, then post one lot per card into the
 * live evening.
 */
export default function Post() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const sim = useLiveSnapshot();
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [chosenPickup, setChosenPickup] = useState<Minute | null>(null);
  const [failed, setFailed] = useState(false);
  /** Set once the post has gone through, so a second tap cannot post the same cards again. */
  const guard = useRef<PostGuard>({ posted: false });

  // The chips follow the clock. If the chosen one is no longer offered, the first valid chip is used.
  const choices = pickupChoices(sim.minute);
  const pickup = chosenPickup !== null && choices.includes(chosenPickup) ? chosenPickup : (choices[0] ?? null);
  const picked = new Set(draft.map((d) => catalogKey(d.foodItem, d.unit)));
  const full = draft.length >= MAX_DRAFT_ITEMS;
  const canPost = draft.length > 0 && pickup !== null;
  const ids = liveEvening.nextLiveIds(draft.length);

  const update = (next: DraftItem[]) => {
    setDraft(next);
    setFailed(false);
  };

  const addItem = (entry: CatalogEntry) => {
    if (full || picked.has(catalogKey(entry.foodItem, entry.unit))) return;
    update([...draft, newDraftItem(entry)]);
  };

  const onPost = () => {
    if (!canPost || pickup === null) return;
    const result = submitLots(liveEvening, lotDrafts(draft, DONOR, pickup), guard.current);
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
            placeholder={S.postScreen.placeholder}
            placeholderTextColor={c.textMuted}
            style={[TYPE.body, styles.input, { color: c.text }]}
            selectionColor={c.tarp}
            cursorColor={c.tarp}
          />
          <Pressable
            disabled
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            accessibilityLabel={S.postScreen.voiceSoon}
            style={[styles.mic, { borderColor: c.rule }]}
          >
            <MicIcon color={c.textMuted} />
          </Pressable>
        </View>
        <Text style={[TYPE.small, { color: c.textMuted }]}>
          {S.postScreen.voiceBody}
        </Text>

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

          {draft.length === 0 ? (
            <Text style={[TYPE.body, { color: c.textMuted }]}>{S.postForm.noItems}</Text>
          ) : (
            <DraftCards
              items={draft}
              onChange={update}
            />
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
                      onPress={() => setChosenPickup(m)}
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
              <Text style={[TYPE.small, { color: c.textMuted }]}>{S.postForm.pickupNote}</Text>
            </>
          )}

          {draft.length > 0 ? <Text style={[TYPE.bodyStrong, { color: c.text }]}>{S.postForm.becomes(ids)}</Text> : null}
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
          {draft.length === 0 ? <Text style={[TYPE.small, { color: c.textMuted }]}>{S.postForm.pickFirst}</Text> : null}
          {failed ? (
            <Text style={[TYPE.body, { color: c.red }]} accessibilityLiveRegion="polite">
              {S.postForm.problems}
            </Text>
          ) : null}
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
