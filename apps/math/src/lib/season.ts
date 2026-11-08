/** Campaign dates are inclusive UTC calendar days, matching reward queries. */
export function getSeasonStatus(
  season: { start: string; end: string },
  now = new Date(),
): "upcoming" | "active" | "ended" {
  const today = now.toISOString().slice(0, 10);
  if (today < season.start) return "upcoming";
  if (today > season.end) return "ended";
  return "active";
}
