import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TarpBar } from '../components/TarpBar';
import { WORLD } from '../data/dataset';
import { pickRole } from '../backend/runtime';
import type { Role } from '../backend/types';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';

/** How long the picker waits for the sign-in and the device registration. Offline, it navigates after this. */
const CONNECT_WAIT_MS = 2500;

/**
 * Pick who you are tonight from the simulated dataset. There is no login: each role gets an anonymous Supabase user,
 * registered for that role (see src/backend/session.ts).
 */
const ROLES = [
  { key: 'donor', fil: 'Donor', en: 'Food business with surplus', who: WORLD.donors.find((d) => d.id === 'D01')!.name, ready: true, route: '/donor' as const, role: 'donor' as Role, profileId: 'D01' as string | null },
  { key: 'pantry', fil: 'Pantry', en: 'Community pantry coordinator', who: WORLD.pantries.find((p) => p.id === 'P01')!.name, ready: false, route: null, role: 'pantry' as Role, profileId: 'P01' as string | null },
  { key: 'driver', fil: 'Driver', en: 'Volunteer driver', who: WORLD.drivers.find((d) => d.id === 'V01')!.name, ready: false, route: null, role: 'driver' as Role, profileId: 'V01' as string | null },
  { key: 'dashboard', fil: 'Dashboard', en: 'Live view for the panel', who: 'Walang profile na kailangan', ready: true, route: '/dashboard' as const, role: 'dashboard' as Role, profileId: null as string | null },
];

/** Stores the role and tries to connect; navigates after at most CONNECT_WAIT_MS, so an offline phone still moves on. */
async function go(role: Role, profileId: string | null, route: '/donor' | '/dashboard') {
  try {
    await Promise.race([pickRole(role, profileId), new Promise<void>((resolve) => setTimeout(resolve, CONNECT_WAIT_MS))]);
  } catch (error) {
    console.warn('picker: backend not ready, continuing offline', error);
  }
  router.push(route);
}

export default function Picker() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <TarpBar clock="5:45 PM" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[TYPE.title, { color: c.text }]} accessibilityRole="header">
          Sino ka ngayong gabi?
        </Text>
        <Text style={[TYPE.small, { color: c.textMuted }]}>Who are you tonight? Lahat ng pangalan ay kathang-isip.</Text>
        <View style={[styles.list, { borderColor: c.rule }]}>
          {ROLES.map((r) => (
            <Pressable
              key={r.key}
              disabled={!r.ready || r.route === null}
              onPress={() => r.route && void go(r.role, r.profileId, r.route)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !r.ready }}
              accessibilityLabel={`${r.fil}, ${r.en}. ${r.who}.${r.ready ? '' : ' Darating sa susunod na build.'}`}
              style={({ pressed }) => [
                styles.row,
                { borderColor: c.rule, backgroundColor: pressed ? c.groundRaised : 'transparent' },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[TYPE.bodyStrong, { color: r.ready ? c.text : c.textMuted }]}>
                  {r.fil} <Text style={[TYPE.small, { color: c.textMuted }]}>· {r.en}</Text>
                </Text>
                <Text style={[TYPE.small, { color: c.textMuted }]}>{r.who}</Text>
              </View>
              <Text style={[TYPE.label, { color: r.ready ? c.tarp : c.textMuted }]}>
                {r.ready ? 'PUMASOK' : 'SA SUSUNOD'}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: SPACE.s },
  list: { marginTop: SPACE.l, borderTopWidth: 1 },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.m,
    paddingVertical: SPACE.m,
    paddingHorizontal: SPACE.xs,
    borderBottomWidth: 1,
  },
});
