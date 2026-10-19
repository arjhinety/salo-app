// Zod schema for the model's structured output, plus the checks the server applies after parsing.
import { z } from "zod/v4";

export const UNITS = ["tray", "piece", "bilao", "kg", "loaf", "pot", "pack", "can"];
export const PICKUP_MIN = "16:00";
export const PICKUP_MAX = "22:00";
export const MAX_ITEMS = 10;
export const MAX_QUANTITY = 500;
export const MAX_FOOD_ITEM_CHARS = 60;

export const ModelOutput = z.object({
  is_food_message: z.boolean(),
  items: z.array(
    z.object({
      food_item: z.string(),
      quantity: z.number().nullable(),
      unit: z.enum(UNITS).nullable(),
    }),
  ),
  pickup_by: z.string().nullable(),
  missing: z.array(z.string()),
});

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Returns true when the parsed model output may be sent to the app. Anything else is a 503 at the HTTP layer.
export function isValidFoodOutput(out) {
  if (!out.items || out.items.length < 1 || out.items.length > MAX_ITEMS) return false;
  for (const it of out.items) {
    if (typeof it.food_item !== "string" || it.food_item.trim() === "") return false;
    if ([...it.food_item].length > MAX_FOOD_ITEM_CHARS) return false;
    if (it.quantity !== null && !(Number.isFinite(it.quantity) && it.quantity > 0 && it.quantity <= MAX_QUANTITY)) return false;
    if (it.unit !== null && !UNITS.includes(it.unit)) return false;
  }
  if (out.pickup_by !== null) {
    const m = HHMM.exec(out.pickup_by);
    if (!m) return false;
    if (out.pickup_by < PICKUP_MIN || out.pickup_by > PICKUP_MAX) return false;
  }
  return true;
}
