/**
 * Counter-based random numbers (decision D-10). A draw depends only on its keys, never on how many
 * draws came before, so all four policies face the same randomness (common random numbers).
 * Uses only Math.imul and integer ops (decision D-05): identical on Hermes, V8 and Jest.
 */

/** Stream ids keep different kinds of draws independent. */
export const STREAM = { pantryReply: 1, driverOutcome: 2, lateMinutes: 3, bootstrap: 4 } as const;

function mix(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A uniform number in [0, 1) for the given keys. `seed` is reduced to 32 bits. */
export function u01(seed: number, stream: number, a: number, b: number, c = 0): number {
  let h = mix((seed % 4294967296) >>> 0);
  h = mix(h ^ Math.imul(stream + 1, 0x9e3779b1));
  h = mix(h ^ Math.imul(a + 1, 0x85ebca77));
  h = mix(h ^ Math.imul(b + 1, 0xc2b2ae3d));
  h = mix(h ^ Math.imul(c + 1, 0x27d4eb2f));
  return h / 4294967296;
}

/** An integer in [0, n) for the given keys. */
export function intBelow(n: number, seed: number, stream: number, a: number, b: number, c = 0): number {
  return Math.floor(u01(seed, stream, a, b, c) * n);
}
