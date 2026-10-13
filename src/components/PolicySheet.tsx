import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PolicyId } from '../engine/types';
import { dash } from '../i18n/strings';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';

export const POLICY_ORDER: readonly PolicyId[] = ['fcfs', 'nearest', 'central_greedy', 'salo'];

/**
 * "Replay with baseline": a Material bottom sheet with one radio row per allocation rule. Choosing a row replays the
 * same lots and clock under that rule. A sheet, not a dialog: it asks for a choice and interrupts nothing else.
 */
export function PolicySheet({
  visible,
  current,
  onPick,
  onClose,
}: {
  visible: boolean;
  current: PolicyId;
  onPick: (p: PolicyId) => void;
  onClose: () => void;
}) {
  const { c, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel={dash.close} />
        <View
          style={[styles.sheet, { backgroundColor: c.groundRaised, paddingBottom: insets.bottom + SPACE.l }]}
          accessibilityViewIsModal
        >
          <View style={[styles.handle, { backgroundColor: c.zinc }]} />
          <Text style={[TYPE.title, { color: c.text }]} accessibilityRole="header">
            {dash.sheetTitle}
          </Text>
          <Text style={[TYPE.small, { color: c.textMuted }]}>{dash.sheetBody}</Text>
          <View style={styles.options} accessibilityRole="radiogroup">
            {POLICY_ORDER.map((p) => {
              const selected = p === current;
              const copy = dash.policies[p];
              return (
                <Pressable
                  key={p}
                  onPress={() => onPick(p)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${copy.name}. ${copy.how}`}
                  style={({ pressed }) => [styles.option, { backgroundColor: pressed ? c.ground : 'transparent' }]}
                >
                  <View style={[styles.radio, { borderColor: selected ? c.tarp : c.textMuted }]}>
                    {selected ? <View style={[styles.dot, { backgroundColor: c.tarp }]} /> : null}
                  </View>
                  <View style={styles.optionText}>
                    <Text style={[TYPE.bodyStrong, { color: c.text }]}>{copy.name}</Text>
                    <Text style={[TYPE.small, { color: c.textMuted }]}>{copy.how}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={dash.close}
            style={({ pressed }) => [styles.close, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[TYPE.label, { color: c.tarp }]}>{dash.close.toUpperCase()}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.s,
    gap: SPACE.s,
  },
  handle: { alignSelf: 'center', width: 32, height: 4, borderRadius: 2, marginBottom: SPACE.s },
  options: { marginTop: SPACE.s },
  option: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.m,
    paddingVertical: SPACE.s,
    paddingHorizontal: SPACE.xs,
    borderRadius: 12,
  },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  optionText: { flex: 1, gap: 2 },
  close: { alignSelf: 'flex-end', minHeight: 48, justifyContent: 'center', paddingHorizontal: SPACE.m },
});
