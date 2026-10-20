import { useCallback, useEffect, useRef, useState } from 'react';
import type * as SpeechModule from 'expo-speech-recognition';
import { chooseLocale, joinTranscript, mapSpeechError, canUseOnDevice, type VoiceError } from './speechLogic';

type Speech = typeof SpeechModule;

/** Android package that reports the installed on-device language packs (Google app / AI Core). */
const ANDROID_AS_PACKAGE = 'com.google.android.as';

let speechCache: Speech | null | undefined;

/**
 * Loads the native module on first use. In Expo Go, or any build without the native code, the require
 * throws, so this returns null and the hook reports `available: false` instead of crashing the app.
 */
function loadSpeech(): Speech | null {
  if (speechCache !== undefined) return speechCache;
  try {
    // Lazy on purpose: a top-level import would throw at bundle time in Expo Go.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    speechCache = require('expo-speech-recognition') as Speech;
  } catch {
    speechCache = null;
  }
  return speechCache;
}

/** Whether a recognizer exists on this phone. Synchronous native call, safe during the first render. */
function checkAvailable(speech: Speech | null): boolean {
  if (!speech) return false;
  try {
    return speech.ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export interface SpeechState {
  /** False in Expo Go, or when there is no recognizer on the phone. Starts false until the check runs. */
  available: boolean;
  listening: boolean;
  /** Text from the latest session: finished utterances plus the words still being heard. */
  transcript: string;
  error: VoiceError | null;
  /** Asks for the microphone if needed, then starts a session. Clears the transcript and error first. */
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Tap-and-speak for the donor post screen. Wires expo-speech-recognition: fil-PH, else en-PH, else en-US;
 * on-device only when that locale is installed (otherwise the online recognizer, which needs internet).
 */
export function useSpeech(): SpeechState {
  const [available, setAvailable] = useState(() => checkAvailable(loadSpeech()));
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<VoiceError | null>(null);
  const finalRef = useRef('');

  useEffect(() => {
    const speech = loadSpeech();
    if (!speech) return;
    const mod = speech.ExpoSpeechRecognitionModule;

    const subs = [
      mod.addListener('start', () => setListening(true)),
      mod.addListener('result', (ev) => {
        const text = ev.results[0]?.transcript ?? '';
        if (ev.isFinal) {
          finalRef.current = joinTranscript(finalRef.current, text);
          setTranscript(finalRef.current);
        } else {
          setTranscript(joinTranscript(finalRef.current, text));
        }
      }),
      mod.addListener('error', (ev) => {
        setError(mapSpeechError(ev.error));
        setListening(false);
      }),
      mod.addListener('end', () => setListening(false)),
    ];
    return () => {
      subs.forEach((s) => s.remove());
      // Leaving the screen mid-session must not keep the microphone open.
      try {
        mod.abort();
      } catch {
        // Nothing was running.
      }
    };
  }, []);

  const start = useCallback(async () => {
    const speech = loadSpeech();
    setError(null);
    setTranscript('');
    finalRef.current = '';
    if (!speech) {
      setAvailable(false);
      setError('unavailable');
      return;
    }
    const mod = speech.ExpoSpeechRecognitionModule;
    try {
      if (!mod.isRecognitionAvailable()) {
        setAvailable(false);
        setError('unavailable');
        return;
      }
      const current = await mod.getPermissionsAsync();
      const perm = current.granted ? current : await mod.requestPermissionsAsync();
      if (!perm.granted) {
        setError('permission');
        return;
      }

      let locales: string[] = [];
      let installed: string[] = [];
      try {
        const res = await mod.getSupportedLocales({ androidRecognitionServicePackage: ANDROID_AS_PACKAGE });
        locales = res.locales;
        installed = res.installedLocales;
      } catch {
        // No on-device service package: keep the defaults and let the default recognizer decide.
      }
      // An empty list means the platform cannot say (Android 12 and below); en-US is the fallback then.
      const lang = locales.length === 0 ? 'en-US' : chooseLocale(locales);
      if (!lang) {
        setError('language');
        return;
      }

      setAvailable(true);
      setListening(true);
      mod.start({ lang, requiresOnDeviceRecognition: canUseOnDevice(lang, installed), interimResults: true });
    } catch {
      setListening(false);
      setError('other');
    }
  }, []);

  const stop = useCallback(() => {
    setListening(false);
    try {
      loadSpeech()?.ExpoSpeechRecognitionModule.stop();
    } catch {
      // Not running.
    }
  }, []);

  return { available, listening, transcript, error, start, stop };
}
