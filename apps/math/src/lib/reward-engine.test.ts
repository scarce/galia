import { describe, it, expect } from "vitest";
import {
  simulate,
  applySession,
  initState,
  type EngineSession,
} from "./reward-engine";
import { computeStreaks } from "./rewards";
import { DEFAULT_RULES, type RewardRules } from "./reward-rules";

// Build a session from terse inputs. `result` is a percentage (0–100).
function ses(
  date: string,
  result: number,
  extra: Partial<EngineSession> = {},
): EngineSession {
  const total = extra.totalQuestions ?? 40;
  return {
    date,
    themeId: extra.themeId ?? "addition",
    level: extra.level ?? "easy",
    score: Math.round((result / 100) * total),
    totalQuestions: total,
    round: extra.round,
    isTest: extra.isTest,
  };
}

// N consecutive days starting 2026-07-01.
function days(n: number): string[] {
  const base = Date.UTC(2026, 6, 1);
  return Array.from({ length: n }, (_, i) =>
    new Date(base + i * 86400000).toISOString().slice(0, 10),
  );
}

function withRules(over: Partial<RewardRules>): RewardRules {
  return {
    ...DEFAULT_RULES,
    ...over,
    collectible: { ...DEFAULT_RULES.collectible, ...(over.collectible ?? {}) },
    tickets: { ...DEFAULT_RULES.tickets, ...(over.tickets ?? {}) },
    badges: { ...DEFAULT_RULES.badges, ...(over.badges ?? {}) },
  };
}

const badgeIds = (r: ReturnType<typeof simulate>) =>
  r.days.flatMap((d) => d.badges.map((b) => b.id));

describe("badges", () => {
  it("awards First Steps on the very first session", () => {
    const r = simulate([ses("2026-07-01", 75)], { seed: 1 });
    expect(badgeIds(r)).toContain("first-steps");
  });

  it("awards Century once 100 problems are solved (3×40)", () => {
    const d = days(3);
    const r = simulate(
      d.map((x) => ses(x, 70)),
      { seed: 1 },
    );
    expect(badgeIds(r)).toContain("century");
    // earned exactly once
    expect(badgeIds(r).filter((b) => b === "century")).toHaveLength(1);
  });

  it("awards streak badges at the right thresholds", () => {
    const r = simulate(
      days(7).map((x) => ses(x, 60)),
      { seed: 1 },
    );
    const ids = badgeIds(r);
    expect(ids).toContain("on-a-roll"); // 3-day
    expect(ids).toContain("week-warrior"); // 7-day
    expect(ids).not.toContain("fortnight"); // 14-day not reached
  });

  it("awards Comeback Kid when a retry round is perfect", () => {
    const r = simulate(
      [
        ses("2026-07-01", 80, { round: 1 }),
        ses("2026-07-01", 100, { round: 2 }),
      ],
      { seed: 1 },
    );
    expect(badgeIds(r)).toContain("comeback-kid");
  });

  it("awards Daredevil for a Hard quiz", () => {
    const r = simulate([ses("2026-07-01", 50, { level: "hard" })], { seed: 1 });
    expect(badgeIds(r)).toContain("daredevil");
  });
});

const perSession = (over: object = {}) =>
  withRules({
    collectible: { ...DEFAULT_RULES.collectible, mode: "perSession", ...over },
  });

describe("collectibles — points mode (default)", () => {
  it("one HARD session at/above threshold earns a collectible", () => {
    const state = initState();
    const r = applySession(state, ses("2026-07-01", 70, { level: "hard" }));
    expect(r.collectible).not.toBeNull();
  });

  it("needs two MEDIUM sessions", () => {
    const state = initState();
    const a = applySession(state, ses("2026-07-01", 80, { level: "medium" }));
    const b = applySession(state, ses("2026-07-02", 80, { level: "medium" }));
    expect(a.collectible).toBeNull();
    expect(b.collectible).not.toBeNull();
  });

  it("needs three EASY sessions", () => {
    const state = initState();
    const a = applySession(state, ses("2026-07-01", 95, { level: "easy" }));
    const b = applySession(state, ses("2026-07-02", 95, { level: "easy" }));
    const c = applySession(state, ses("2026-07-03", 95, { level: "easy" }));
    expect(a.collectible).toBeNull();
    expect(b.collectible).toBeNull();
    expect(c.collectible).not.toBeNull();
  });

  it("below a level's result threshold earns no points", () => {
    const state = initState();
    // easy needs 90%; 85% earns nothing, hard needs 60%; 50% earns nothing
    const easyLow = applySession(state, ses("2026-07-01", 85, { level: "easy" }));
    const hardLow = applySession(state, ses("2026-07-02", 50, { level: "hard" }));
    expect(easyLow.collectible).toBeNull();
    expect(hardLow.collectible).toBeNull();
  });

  it("mixes levels via the points bank (medium + medium, or hard alone)", () => {
    const state = initState();
    applySession(state, ses("2026-07-01", 80, { level: "medium" })); // +3 → 3
    const second = applySession(state, ses("2026-07-02", 80, { level: "medium" })); // +3 → 6 → drop
    expect(second.collectible).not.toBeNull();
  });
});

describe("collectibles — perSession mode", () => {
  it("drops one every qualifying session (cooldown 0)", () => {
    const r = simulate(
      days(5).map((x) => ses(x, 80)),
      { seed: 7, rules: perSession() },
    );
    expect(r.days.flatMap((d) => d.collectibles)).toHaveLength(5);
  });

  it("respects sessionCooldown=1 (no two consecutive drops)", () => {
    const rules = perSession({ sessionCooldown: 1 });
    const state = initState();
    const rng = () => 0.5;
    const c1 = applySession(state, ses("2026-07-01", 80), rng, rules);
    const c2 = applySession(state, ses("2026-07-02", 80), rng, rules);
    const c3 = applySession(state, ses("2026-07-03", 80), rng, rules);
    expect(c1.collectible).not.toBeNull();
    expect(c2.collectible).toBeNull(); // cooldown
    expect(c3.collectible).not.toBeNull();
  });

  it("respects minAccuracy", () => {
    const rules = perSession({ minAccuracy: 0.8 });
    const state = initState();
    const low = applySession(state, ses("2026-07-01", 50), () => 0.5, rules);
    const high = applySession(state, ses("2026-07-02", 95), () => 0.5, rules);
    expect(low.collectible).toBeNull();
    expect(high.collectible).not.toBeNull();
  });

  it("is deterministic for a given seed", () => {
    const sessions = days(10).map((x) => ses(x, 85));
    const opts = { seed: 42, rules: perSession() };
    const ids = (r: ReturnType<typeof simulate>) =>
      r.days.flatMap((d) => d.collectibles.map((c) => c.id));
    expect(ids(simulate(sessions, opts))).toEqual(ids(simulate(sessions, opts)));
  });
});

describe("golden tickets", () => {
  it("caps tickets per day (dailyCap)", () => {
    const rules = withRules({
      tickets: {
        ...DEFAULT_RULES.tickets,
        perfectScoreChance: 1, // always win on perfect
        guaranteedOnLegendaryBadge: false,
        dailyCap: 1,
      },
    });
    const state = initState();
    const t1 = applySession(state, ses("2026-07-01", 100), () => 0.1, rules);
    const t2 = applySession(state, ses("2026-07-01", 100), () => 0.1, rules);
    expect(t1.tickets).toHaveLength(1);
    expect(t2.tickets).toHaveLength(0); // capped
  });

  it("does not award tickets on non-perfect scores", () => {
    const rules = withRules({
      tickets: {
        ...DEFAULT_RULES.tickets,
        perfectScoreChance: 1,
        guaranteedOnLegendaryBadge: false,
      },
    });
    const state = initState();
    const t = applySession(state, ses("2026-07-01", 95), () => 0.1, rules);
    expect(t.tickets).toHaveLength(0);
  });
});

describe("first-round gating", () => {
  it("retries (round > 1) grant no loot, but still count for badges", () => {
    const state = initState();
    // round 1: medium at 60% — below the 75% threshold → 0 points, no loot
    applySession(state, ses("2026-07-01", 60, { level: "medium", round: 1 }));
    // round 2: aces it — but loot is first-round only
    const r2 = applySession(
      state,
      ses("2026-07-01", 100, { level: "medium", round: 2 }),
    );
    expect(r2.pointsEarned).toBe(0);
    expect(r2.collectible).toBeNull();
    expect(r2.tickets).toHaveLength(0);
    // the comeback IS recognised (badge, cumulative)
    expect(r2.badges.map((b) => b.id)).toContain("comeback-kid");
  });

  it("first round grants points using that round's result", () => {
    const state = initState();
    const r = applySession(
      state,
      ses("2026-07-01", 70, { level: "hard", round: 1 }),
    );
    expect(r.pointsEarned).toBe(6); // hard, ≥60%
  });
});

describe("points & end-of-summer redemption", () => {
  it("points are cumulative (not spent) and convert to dollars", () => {
    // 3 hard perfect sessions = 18 points; collectibles unlocked but points stay.
    const r = simulate(
      ["2026-07-01", "2026-07-02", "2026-07-03"].map((d) =>
        ses(d, 100, { level: "hard" }),
      ),
      { seed: 1 },
    );
    expect(r.totalPoints).toBe(18); // 3 × 6, never decremented
    expect(r.state.collectiblesAwarded).toBe(3);
    expect(r.dollars).toBeCloseTo(18 * 0.76, 5);
  });

  it("a perfect-hard 2-month run cashes out near the $200 anchor", () => {
    // 44 weekday hard-perfect sessions = 264 points.
    const wd: EngineSession[] = [];
    const base = Date.UTC(2026, 6, 1);
    for (let i = 0; wd.length < 44; i++) {
      const d = new Date(base + i * 86400000);
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      wd.push(ses(d.toISOString().slice(0, 10), 100, { level: "hard" }));
    }
    const r = simulate(wd, { seed: 1 });
    expect(r.totalPoints).toBe(264);
    expect(r.dollars).toBeCloseTo(264 * 0.76, 5); // ≈ $200.64, the ~$200 anchor
  });
});

describe("streaks — weekend-forgiving with make-up", () => {
  // 2026-07-06 is a Monday.
  const MON = "2026-07-06";
  const TUE = "2026-07-07";
  const WED = "2026-07-08";
  const THU = "2026-07-09";
  const FRI = "2026-07-10";
  const SAT = "2026-07-11";
  const SUN = "2026-07-12";
  const NEXT_MON = "2026-07-13";

  it("weekends don't break a weekday streak", () => {
    // Mon–Fri, skip the weekend, then next Mon — should be one unbroken run.
    const r = computeStreaks([MON, TUE, WED, THU, FRI, NEXT_MON], NEXT_MON);
    expect(r.current).toBe(8); // Mon..nextMon inclusive (weekend bridged)
    expect(r.best).toBe(8);
  });

  it("a missed weekday made up on the weekend keeps the streak", () => {
    // Missed Friday, but practised Saturday → forgiven.
    const r = computeStreaks([MON, TUE, WED, THU, SAT, NEXT_MON], NEXT_MON);
    expect(r.current).toBe(8); // Fri covered by Sat make-up
  });

  it("a missed weekday with no make-up breaks the streak", () => {
    // Missed Friday, no weekend practice → Friday breaks the run.
    const r = computeStreaks([MON, TUE, WED, THU, NEXT_MON], NEXT_MON);
    // current run is just NEXT_MON (Fri uncovered, Sat/Sun free but run restarts Mon)
    expect(r.current).toBe(3); // Sat, Sun, Mon
    expect(r.best).toBe(4); // Mon–Thu
  });

  it("two missed weekdays with only one make-up day still breaks", () => {
    // Missed Thu+Fri, only Sat made up (1 credit) → one weekday still uncovered.
    const r = computeStreaks([MON, TUE, WED, SAT, NEXT_MON], NEXT_MON);
    expect(r.best).toBeLessThan(8);
  });

  it("two missed weekdays made up by Sat+Sun keeps the streak", () => {
    const r = computeStreaks([MON, TUE, WED, SAT, SUN, NEXT_MON], NEXT_MON);
    expect(r.best).toBe(8); // both Thu and Fri forgiven
  });

  it("a trailing inactive weekend is not a streak on its own", () => {
    // Last activity was Monday; "today" is the following Sunday with no recent
    // practice. Free weekend days must not manufacture a streak out of nothing.
    const r = computeStreaks([MON], SUN);
    expect(r.current).toBe(0);
  });

  it("an inactive weekend still shows no streak even with older activity", () => {
    // Active only on Mon/Tue, then nothing; today is Sunday (a free weekend).
    const r = computeStreaks([MON, TUE], SUN);
    expect(r.current).toBe(0);
  });
});

describe("summer scenario (high-level shape)", () => {
  it("a diligent 6-week summer earns rich rewards", () => {
    // ~5 days/week for 6 weeks, improving accuracy, some Hard quizzes.
    const all = days(42);
    const sessions: EngineSession[] = [];
    all.forEach((d, i) => {
      if (i % 7 === 5 || i % 7 === 6) return; // skip weekends
      sessions.push(
        ses(d, 75 + (i % 20), {
          themeId: ["addition", "subtraction", "geometry", "algebra"][i % 4],
          level: i % 5 === 0 ? "hard" : "easy",
        }),
      );
    });
    const r = simulate(sessions, { seed: 3 });
    const ids = new Set(badgeIds(r));
    // Weekends are forgiven, so weekday-only practice keeps a long streak going.
    expect(ids.has("on-a-roll")).toBe(true);
    expect(ids.has("week-warrior")).toBe(true);
    expect(ids.has("daredevil")).toBe(true);
    expect(ids.has("century")).toBe(true);
    // earns collectibles via the points model (fewer than perSession, by design)
    const drops = r.days.flatMap((d) => d.collectibles);
    expect(drops.length).toBeGreaterThan(0);
    expect(r.finalStats.bestStreak).toBeGreaterThanOrEqual(21);
  });
});
