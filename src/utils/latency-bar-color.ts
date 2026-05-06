/**
 * Apple system–style colors for latency bars (same thresholds as before).
 */
export function latencyBarColor(ms: number | null): string {
  if (ms === null) return "#8e8e93";
  if (ms < 200) return "#34c759";
  if (ms < 500) return "#30d158";
  if (ms < 1000) return "#ffcc00";
  if (ms < 3000) return "#ff9500";
  return "#ff3b30";
}
