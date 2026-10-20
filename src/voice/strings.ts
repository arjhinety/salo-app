/** Voice UI copy for the donor post screen. Filipino first, English after " · ". */
export const voiceStrings = {
  /** Shown on the voice button while a session is running. */
  listening: 'Nakikinig… · Listening…',
  /** Idle voice button label, from the mockup (Fig 2). */
  tapToSpeak: 'Pindutin at magsalita · Tap and speak',
  /** Voice button label while a session is running. */
  stop: 'Ihinto · Stop',
  /** Shown before the first microphone request, in context. */
  permissionReason: 'Gagamitin ang mikropono habang nagsasalita ka lang. · The microphone is used only while you speak.',
  /** One line per VoiceError. */
  errors: {
    permission: 'Hindi pinayagan ang mikropono. Mag-type ka na lang. · Microphone permission denied. Type instead.',
    'no-speech': 'Walang narinig. Subukan ulit. · No speech heard. Try again.',
    network: 'Kailangan ng internet para sa boses. · Voice needs internet.',
    language: 'Hindi available ang wika para sa boses. · Voice language not available.',
    unavailable: 'Hindi available ang boses sa telepono na ito. Puwede ka pa ring mag-type. · Voice is not available on this phone. You can still type.',
    other: 'May problema sa boses. Mag-type ka na lang. · Voice problem. Type instead.',
  },
  /** Expo Go has no speech module. The screen should say voice needs the app build. */
  needsAppBuild: 'Kailangan ng app build para sa boses. · Voice needs the app build.',
} as const;
