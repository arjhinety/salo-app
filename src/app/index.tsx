import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { TarpBar } from '../components/TarpBar';
import { WORLD } from '../data/dataset';
import { follower, pickRole, useStrandedOutbox } from '../backend/runtime';
import { SYNC } from '../i18n/sync';
import { PICKER } from '../i18n/strings';
import type { Role } from '../backend/types';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';

/** How long the picker waits for the sign-in and the device registration. Offline, it navigates after this. */
const CONNECT_WAIT_MS = 2500;

type Route = '/donor' | '/pantry' | '/driver' | '/dashboard';

/**
 * Pick who you are tonight from the simulated dataset. There is no login: each role gets an anonymous Supabase user,
 * registered for that role (see src/backend/session.ts).
 */
const ROLES = [
  { key: 'donor', fil: PICKER.roles.donor.fil, en: PICKER.roles.donor.en, who: WORLD.donors.find((d) => d.id === 'D01')!.name, ready: true, route: '/donor' as Route | null, role: 'donor' as Role, profileId: 'D01' as string | null },
  { key: 'pantry', fil: PICKER.roles.pantry.fil, en: PICKER.roles.pantry.en, who: WORLD.pantries.find((p) => p.id === 'P01')!.name, ready: true, route: '/pantry' as Route | null, role: 'pantry' as Role, profileId: 'P01' as string | null },
  // The driver's profile is chosen on the driver screen, which registers the phone with it (the schema needs the profile).
  { key: 'driver', fil: PICKER.roles.driver.fil, en: PICKER.roles.driver.en, who: PICKER.roles.driver.who, ready: true, route: '/driver' as Route | null, role: 'driver' as Role, profileId: null as string | null },
  { key: 'dashboard', fil: PICKER.roles.dashboard.fil, en: PICKER.roles.dashboard.en, who: PICKER.roles.dashboard.who, ready: true, route: '/dashboard' as Route | null, role: 'dashboard' as Role, profileId: null as string | null },
];

/**
 * Stores the role and tries to connect; navigates after at most CONNECT_WAIT_MS, so an offline phone still moves on.
 * The driver role is registered by the driver screen, once a driver is chosen there.
 */
async function go(role: Role, profileId: string | null, route: Route, joinCode: string) {
  // A typed code makes this phone a follower of that session (M5). The dashboard never joins: it owns the session.
  if (role === 'dashboard' || joinCode.length === 0) follower.leave();
  else follower.join(joinCode);
  if (role !== 'driver') {
    try {
      await Promise.race([pickRole(role, profileId), new Promise<void>((resolve) => setTimeout(resolve, CONNECT_WAIT_MS))]);
    } catch (error) {
      console.warn('picker: backend not ready, continuing offline', error);
    }
  }
  router.push(route as Href);
}

export default function Picker() {
  const { c } = useTheme();
  const stranded = useStrandedOutbox();
  const [joinCode, setJoinCode] = useState('');
  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <TarpBar clock="5:45 PM" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[TYPE.title, { color: c.text }]} accessibilityRole="header">
          {PICKER.title}
        </Text>
        <Text style={[TYPE.small, { color: c.textMuted }]}>{PICKER.subtitle}</Text>

        {stranded.count > 0 ? (
          // The count is announced when it changes; the explanation and the discard button are read in order after it.
          <View style={[styles.stranded, { borderColor: c.tarp }]}>
            <Text style={[TYPE.bodyStrong, { color: c.text }]} accessibilityLiveRegion="polite">
              {PICKER.stranded.count(stranded.count)}
            </Text>
            <Text style={[TYPE.small, { color: c.textMuted }]}>{PICKER.stranded.keptHere}</Text>
            <Pressable
              onPress={stranded.discard}
              accessibilityRole="button"
              accessibilityLabel={PICKER.stranded.discardA11y}
              style={({ pressed }) => [styles.discard, { borderColor: c.rule, backgroundColor: pressed ? c.groundRaised : 'transparent' }]}
            >
              <Text style={[TYPE.label, { color: c.text }]}>{PICKER.stranded.discard}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.join, { borderColor: c.rule }]}>
          <Text style={[TYPE.bodyStrong, { color: c.text }]}>{SYNC.join.title}</Text>
          <Text style={[TYPE.small, { color: c.textMuted }]}>{SYNC.join.hint}</Text>
          <TextInput
            value={joinCode}
            onChangeText={(t) => setJoinCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder={SYNC.join.placeholder}
            placeholderTextColor={c.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            accessibilityLabel={SYNC.join.a11y}
            accessibilityHint={SYNC.join.hint}
            style={[TYPE.bodyStrong, styles.joinInput, { color: c.text, borderColor: c.rule }]}
          />
        </View>

        <View style={[styles.list, { borderColor: c.rule }]}>
          {ROLES.map((r) => (
            <Pressable
              key={r.key}
              disabled={!r.ready || r.route === null}
              onPress={() => r.route && void go(r.role, r.profileId, r.route, joinCode)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !r.ready }}
              accessibilityLabel={PICKER.roleA11y(r.fil, r.en, r.who, r.ready)}
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
                {r.ready ? PICKER.state.open : PICKER.state.later}
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
  join: { marginTop: SPACE.l, gap: SPACE.xs, borderBottomWidth: 1, paddingBottom: SPACE.m },
  joinInput: { minHeight: 48, borderWidth: 1.5, borderRadius: 4, paddingHorizontal: SPACE.m, letterSpacing: 4 },
  stranded: { marginTop: SPACE.m, borderWidth: 2, borderStyle: 'dashed', borderRadius: 4, padding: SPACE.m, gap: SPACE.xs },
  discard: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', borderWidth: 1, paddingHorizontal: SPACE.m, marginTop: SPACE.xs },
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
