import { ScrollView, StyleSheet, View, Text } from 'react-native';
import { estimateText, type DriverTrack } from '../live/drivers';
import { dash } from '../i18n/strings';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';

/**
 * The driver track record (DSH-07): "Showed up X of Y runs (estimate Z)" per driver asked tonight, from the frozen tuning
 * counts. A driver with no tuning run reads "New volunteer, no history yet (estimate 0.50)".
 */
export function DriverTrackPanel({ tracks }: { tracks: readonly DriverTrack[] }) {
  const { c } = useTheme();
  return (
    <ScrollView style={[styles.paper, { backgroundColor: c.tape }]} contentContainerStyle={styles.list}>
      <Text style={[TYPE.tapeType, { color: c.onTape }]}>{dash.driversTitle}</Text>
      <Text style={[TYPE.small, { color: c.onTape }]}>{dash.driversNote}</Text>
      {tracks.length === 0 ? (
        <Text style={[TYPE.tapeBody, { color: c.onTape }]}>{dash.driversEmpty}</Text>
      ) : (
        tracks.map((t) => {
          const line = t.newVolunteer ? dash.newVolunteer(estimateText(t.estimate)) : dash.track(t.shows, t.runs, estimateText(t.estimate));
          return (
            <View key={t.id} accessible accessibilityRole="text" accessibilityLabel={`${t.name}. ${line}`} style={styles.row}>
              <Text style={[TYPE.bodyStrong, { color: c.onTape }]}>{t.name}</Text>
              <Text style={[TYPE.tapeBody, { color: c.onTape }]}>{line}</Text>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  paper: { flex: 1 },
  list: { padding: SPACE.l, gap: SPACE.m },
  row: { gap: 2, paddingBottom: SPACE.s, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#0000001f' },
});
