import { describe, expect, it } from "vitest";
import { getSeasonStatus } from "./season";

const season = { start: "2026-06-01", end: "2026-09-10" };

describe("campaign display status", () => {
  it.each([
    ["2026-05-31T23:59:59Z", "upcoming"],
    ["2026-06-01T00:00:00Z", "active"],
    ["2026-09-10T23:59:59Z", "active"],
    ["2026-09-11T00:00:00Z", "ended"],
  ])("shows %s as %s", (date, status) => {
    expect(getSeasonStatus(season, new Date(date))).toBe(status);
  });
});
