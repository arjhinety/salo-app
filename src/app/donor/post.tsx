import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MicIcon } from '../../components/icons';
import { TarpBar } from '../../components/TarpBar';
import { hhmm } from '../../donor/tonight';
import { useLiveSnapshot } from '../../live/useLive';
import { S } from '../../i18n/strings';
import { useTheme } from '../../theme/theme';
import { SPACE, TYPE } from '../../theme/tokens';

/**
 * M2 shell of the post flow: the donor writes or says it like a text. Parsing (Claude Haiku via the
 * laptop proxy, rule fallback) arrives in M4; posting into the live evening arrives in M3.
 */
export default function Post() {
  const { c } = useTheme();
  const sim = useLiveSnapshot();
  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <TarpBar clock={hhmm(sim.minute)} subtitle={`${S.post.fil} · ${S.post.en}`} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
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
