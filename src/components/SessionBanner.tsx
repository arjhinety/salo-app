import { StyleSheet, Text, View } from 'react-native';
import { useFollowStatus } from '../backend/useSession';
import { SYNC } from '../i18n/sync';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';

/**
 * The connection and request state of a phone that follows a joined session (M5). Nothing is shown when the phone is not
 * joined. Shown above the screen's content, so the donor, the driver and the pantry read the same state.
 */
export function SessionBanner() {
  const { c } = useTheme();
  const status = useFollowStatus();
  if (status.state === 'idle') return null;

  const lines: { key: string; text: string; tone: 'strong' | 'muted' | 'alert' }[] = [];
  if (status.state === 'joining') lines.push({ key: 'join', text: SYNC.state.connecting, tone: 'muted' });
  if (status.state === 'offline') {
    const stale = (status.message ?? '').startsWith('The dashboard');
    lines.push({ key: 'off', text: stale ? SYNC.state.stale : SYNC.state.offline, tone: 'alert' });
    lines.push({ key: 'offh', text: SYNC.state.offlineHint, tone: 'muted' });
  }
  if (status.state === 'ended') {
    lines.push({ key: 'end', text: SYNC.state.ended, tone: 'alert' });
    lines.push({ key: 'endh', text: SYNC.state.endedHint, tone: 'muted' });
  }
  if (status.state === 'refused') {
    const bad = (status.message ?? '').includes('six');
    const limited = (status.message ?? '').startsWith('Too many');
    const text = bad ? SYNC.join.badCode : limited ? SYNC.join.tooMany : SYNC.state.refused;
    lines.push({ key: 'ref', text, tone: 'alert' });
  }
  if (status.state === 'live' && status.watchOnly) lines.push({ key: 'watch', text: SYNC.state.watchOnly, tone: 'muted' });
  for (const r of status.requests) {
    if (r.status === 'sending') lines.push({ key: `r${r.localId}`, text: SYNC.request.sending, tone: 'strong' });
    if (r.status === 'unsent') lines.push({ key: `r${r.localId}`, text: SYNC.request.unsent, tone: 'muted' });
    if (r.status === 'rejected') lines.push({ key: `r${r.localId}`, text: SYNC.request.rejected(r.reason ?? ''), tone: 'alert' });
  }
  if (lines.length === 0) return null;

  return (
    <View style={[styles.box, { borderColor: c.rule, backgroundColor: c.groundRaised }]}>
      {lines.map((l) => (
        <Text
          key={l.key}
          // Each status line is its own live region: a new message (the code limit, the code not found, a request
          // that failed) is spoken once, and the others are not repeated.
          accessibilityLiveRegion="polite"
          style={[
            l.tone === 'strong' ? TYPE.bodyStrong : TYPE.small,
            { color: l.tone === 'alert' ? c.red : l.tone === 'muted' ? c.textMuted : c.text },
          ]}
        >
          {l.text}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginHorizontal: SPACE.l, marginTop: SPACE.s, borderWidth: 1, borderRadius: 4, padding: SPACE.m, gap: SPACE.xs },
});
