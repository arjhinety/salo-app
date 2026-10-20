// Calls Claude for one donor message and maps the outcome to an HTTP status and body.
// Reads only stop_reason and parsed_output from the response; never indexes content blocks.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, MAX_OUTPUT_TOKENS } from "./config.js";
import { ModelOutput, isValidFoodOutput } from "./schema.js";

const NOT_FOOD_REASON = "The message does not offer leftover food.";
const UNAVAILABLE = "model unavailable";
const REJECTED = "model output rejected";

// The effort sent with every /parse call. src/requestConfig.js hashes it, so both must read this constant.
export const REQUEST_EFFORT = "low";

// Token usage copied from a model response. Each field is null when the API omits it. Thinking tokens are billed as
// output and are counted in output_tokens, so nothing is added here.
export function usageOf(response) {
  const u = response?.usage ?? null;
  const pick = (k) => (u && typeof u[k] === "number" ? u[k] : null);
  return {
    input_tokens: pick("input_tokens"),
    output_tokens: pick("output_tokens"),
    cache_creation_input_tokens: pick("cache_creation_input_tokens"),
    cache_read_input_tokens: pick("cache_read_input_tokens"),
  };
}

export function createParser({ client, systemPrompt, model = MODEL }) {
  const format = zodOutputFormat(ModelOutput);

  return async function parseText(text) {
    if (!client) return { status: 503, body: { error: "model_unavailable", reason: UNAVAILABLE, error_kind: "no_client", usage: null } };

    let response;
    try {
      response = await client.messages.parse({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: text }],
        output_config: { format, effort: REQUEST_EFFORT },
      });
    } catch (err) {
      return mapSdkError(err);
    }

    // From here on a model response exists, so every body below carries its usage (a rejected output was still billed).
    const usage = usageOf(response);
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return { status: 503, body: { error: "model_output_rejected", reason: REJECTED, usage } };
    }
    const parsed = ModelOutput.safeParse(response.parsed_output);
    if (!parsed.success) {
      return { status: 503, body: { error: "model_output_rejected", reason: REJECTED, usage } };
    }
    const out = parsed.data;
    if (!out.is_food_message) {
      return { status: 422, body: { error: "not_food_message", reason: NOT_FOOD_REASON, usage } };
    }
    if (!isValidFoodOutput(out)) {
      return { status: 503, body: { error: "model_output_rejected", reason: REJECTED, usage } };
    }
    return {
      status: 200,
      body: {
        items: out.items.map((i) => ({ food_item: i.food_item, quantity: i.quantity, unit: i.unit })),
        pickup_by: out.pickup_by,
        missing: out.missing,
        source: "llm",
        model,
        usage,
      },
    };
  };
}

// Typed SDK errors only. Messages are never echoed, so no key or header can leak. error_kind says what kind of failure it
// was, for setup diagnostics and for the recorder's safety stop (docs/decisions.md, M4 recorder rules):
//   auth (401/403), bad_request (400/404/422), timeout (SDK timeout), connection (no connection), server (5xx), other.
export function mapSdkError(err) {
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, body: { error: "rate_limited", reason: "model rate limit", usage: null }, retryAfterSec: 60 };
  }
  return { status: 503, body: { error: "model_unavailable", reason: UNAVAILABLE, error_kind: errorKind(err), usage: null } };
}

export function errorKind(err) {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return "auth";
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError
    || err instanceof Anthropic.UnprocessableEntityError) return "bad_request";
  // APIConnectionTimeoutError extends APIConnectionError, so it is tested first.
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (err instanceof Anthropic.APIConnectionError) return "connection";
  if (err instanceof Anthropic.InternalServerError) return "server";
  if (err instanceof Anthropic.APIError && typeof err.status === "number" && err.status >= 500) return "server";
  return "other";
}
