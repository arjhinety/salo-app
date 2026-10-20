/** Pure helpers for speech-to-text. No native imports here, so these run in jest. */

/** Locales the donor post screen may use, best first. */
export const VOICE_LOCALES = ['fil-PH', 'en-PH', 'en-US'] as const;
export type VoiceLocale = (typeof VOICE_LOCALES)[number];

/** Error kinds the screen can show. `permission` is the only one that maps to a settings action. */
export type VoiceError = 'permission' | 'no-speech' | 'network' | 'language' | 'unavailable' | 'other';

/**
 * The first of fil-PH, en-PH, en-US that the recognizer lists as supported.
 * Returns null when none is listed (the caller decides what that means).
 */
export function chooseLocale(supported: readonly string[]): VoiceLocale | null {
  for (const locale of VOICE_LOCALES) {
    if (supported.includes(locale)) return locale;
  }
  return null;
}

/** On-device recognition only when the chosen locale is already installed for offline use. */
export function canUseOnDevice(lang: string, installedLocales: readonly string[]): boolean {
  return installedLocales.includes(lang);
}

/**
 * Maps a recognizer error code (expo-speech-recognition ExpoSpeechRecognitionErrorCode) to a screen error.
 * `aborted` (the app cancelled it) is not an error the donor needs to see, so it maps to null.
 */
export function mapSpeechError(code: string): VoiceError | null {
  switch (code) {
    case 'aborted':
      return null;
    case 'not-allowed':
      return 'permission';
    case 'no-speech':
    case 'speech-timeout':
      return 'no-speech';
    case 'network':
      return 'network';
    case 'language-not-supported':
      return 'language';
    case 'service-not-allowed':
      return 'unavailable';
    default:
      return 'other';
  }
}

/**
 * Joins the text from earlier final results with the newest partial or final text, so a
 * session that produces several final utterances keeps all of them.
 */
export function joinTranscript(finalSoFar: string, current: string): string {
  const next = current.trim();
  if (!finalSoFar) return next;
  if (!next) return finalSoFar;
  return `${finalSoFar} ${next}`;
}
