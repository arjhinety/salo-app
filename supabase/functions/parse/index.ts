// Supabase Edge Function "parse": POST /functions/v1/parse {text}, GET /functions/v1/parse/health.
// Auth: withSupabase({ auth: "user" }) verifies the caller's Supabase JWT (anonymous users included) and gives the
// verified user id. The Anthropic key is the secret ANTHROPIC_API_KEY (never in the app, never in a response).
import { withSupabase } from "@supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./prompt.ts";
import { SDK_TIMEOUT_MS, SDK_VERSION, readSdkMaxRetries } from "./config.ts";
import { createParser, type MessagesClient } from "./parse.ts";
import { createHandler } from "./handler.ts";
import { currentRequestConfigSha256, sha256Text } from "./requestConfig.ts";
import { supabaseStore } from "./requestStore.ts";

// Startup checks: a bad SALO_SDK_MAX_RETRIES stops the function from loading, as the laptop proxy refuses to start.
const sdkMaxRetries = readSdkMaxRetries((n) => Deno.env.get(n));
const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
const keyConfigured = apiKey !== "";
const client = keyConfigured
  ? (new Anthropic({ apiKey, timeout: SDK_TIMEOUT_MS, maxRetries: sdkMaxRetries }) as unknown as MessagesClient)
  : null;

const systemPrompt = buildSystemPrompt();
const promptSha256 = await sha256Text(systemPrompt);
const requestConfigSha256 = await currentRequestConfigSha256(systemPrompt);
const parse = createParser({ client, systemPrompt });

const handle = createHandler({
  parse,
  keyConfigured,
  promptSha256,
  requestConfigSha256,
  sdkVersion: SDK_VERSION,
});

// withSupabase rejects unauthenticated callers with 401 before the handler runs. ctx.supabaseAdmin is the service-role
// client, used only to read and write parse_requests.
Deno.serve(
  withSupabase({ auth: "user", errors: { detailed: false } }, (req, ctx) =>
    handle(req, {
      userId: ctx.userClaims?.id ?? null,
      store: supabaseStore(ctx.supabaseAdmin),
    })),
);
