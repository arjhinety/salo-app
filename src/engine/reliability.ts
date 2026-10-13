/** Beta-Bernoulli posterior mean (guide page 15): R. Dizon (10 + 1) / (11 + 2) = 0.85. */
export function reliability(shows: number, runs: number): number {
  return (shows + 1) / (runs + 2);
}
