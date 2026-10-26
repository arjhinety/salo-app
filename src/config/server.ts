/**
 * Backend addresses (decision "Hosted backend: Supabase replaces the laptop", 2026-10-26). Expo inlines the EXPO_PUBLIC_*
 * values at bundle time from the git-ignored root .env. The publishable key is public by design. No service-role key
 * belongs in the app.
 */
export const SUPABASE_URL: string = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY: string = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** The parse Edge Function's base; `/parse` and `/parse/health` are appended by the client. */
export const PARSE_BASE_URL: string = `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1`;

/**
 * How long the post screen waits for the parse function before the rule-based fallback runs. A real Claude call took
 * about 3.2 s through the laptop proxy (orchestrator, 2026-10-20), so the parser's 4 s default would often fall back for
 * nothing.
 */
export const PARSE_TIMEOUT_MS = 8000;
