// Calls Claude for one donor message and maps the outcome to an HTTP status and body.
// Reads only stop_reason and parsed_output from the response; never indexes content blocks.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL } from "./config.js";
import { ModelOutput, isValidFoodOutput } from "./schema.js";

const NOT_FOOD_REASON = "The message does not offer leftover food.";
const UNAVAILABLE = "model unavailable";
const REJECTED = "model output rejected";

export function createParser({ client, systemPrompt, model = MODEL }) {
  const format = zodOutputFormat(ModelOutput);

  return async function parseText(text) {
    if (!client) return { status: 503, body: { error: "model_unavailable", reason: UNAVAILABLE } };

    let response;
    try {
      response = await client.messages.parse({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: text }],
        output_config: { format, effort: "low" },
      });
    } catch (err) {
      return mapSdkError(err);
    }

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return { status: 503, body: { error: "model_output_rejected", reason: REJECTED } };
    }
    const parsed = ModelOutput.safeParse(response.parsed_output);
    if (!parsed.success) {
      return { status: 503, body: { error: "model_output_rejected", reason: REJECTED } };
    }
    const out = parsed.data;
    if (!out.is_food_message) {
      return { status: 422, body: { error: "not_food_message", reason: NOT_FOOD_REASON } };
    }
    if (!isValidFoodOutput(out)) {
      return { status: 503, body: { error: "model_output_rejected", reason: REJECTED } };
    }
    return {
      status: 200,
      body: {
        items: out.items.map((i) => ({ food_item: i.food_item, quantity: i.quantity, unit: i.unit })),
        pickup_by: out.pickup_by,
        missing: out.missing,
        source: "llm",
        model,
      },
    };
  };
}

// Typed SDK errors only. Messages are never echoed, so no key or header can leak.
export function mapSdkError(err) {
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, body: { error: "rate_limited", reason: "model rate limit" }, retryAfterSec: 60 };
  }
  // AuthenticationError (missing or bad key), APIConnectionError (includes timeouts) and any other error.
  return { status: 503, body: { error: "model_unavailable", reason: UNAVAILABLE } };
}
