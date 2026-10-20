/**
 * Base URL of the laptop's LLM proxy (architecture 5.1). Expo inlines EXPO_PUBLIC_SALO_SERVER at build time, so the
 * value is fixed inside each APK. The default is the Android emulator's alias for the laptop (10.0.2.2). A phone build
 * needs the laptop's LAN address; see docs/release.md "Server address for a phone build".
 */
export const SERVER_URL: string = process.env.EXPO_PUBLIC_SALO_SERVER ?? 'http://10.0.2.2:8787';

/**
 * How long the post screen waits for the LLM proxy before the rule-based fallback runs. A real Claude call through the
 * proxy took about 3.2 s (orchestrator, 2026-10-20), so the parser's 4 s default would often fall back for nothing.
 */
export const PARSE_TIMEOUT_MS = 8000;
