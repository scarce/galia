// Tunable reward-engine rules, loaded from `reward-rules.json` at the app root.
//
// Edit that JSON to change behaviour without touching code. In `next dev` the
// change hot-reloads; in production it ships with the build (redeploy to apply).
//
// Every value is merged over DEFAULTS below, so the JSON can be partial (or
// even missing keys) without breaking the engine.
//
// Keys
// ----
// dailyGoalSeconds          : seconds/day to "close" the red streak ring (30 min).
// collectible.enabled       : master switch for collectible drops.
// collectible.sessionCooldown: sessions that must pass after a drop before the
//                              next one. 0 = a drop every finished session;
//                              1 = no two drops in consecutive sessions; etc.
// collectible.minAccuracy   : minimum session accuracy (0–1) to be drop-eligible.
// collectible.rarityWeights : base odds per rarity (need not sum to 1).
// collectible.accuracyBoost : per-rarity weight multiplier applied as accuracy
//                              rises above 60% (skill nudges luck upward).
// tickets.enabled           : master switch for Golden Tickets.
// tickets.perfectScoreChance: chance to win a ticket on a perfect score.
// tickets.guaranteedOnLegendaryBadge: always win one when a legendary badge is earned.
// tickets.dailyCap          : max tickets a child can win per calendar day.
// badges.enabled            : master switch for mastery badges.

import rawRules from "../../reward-rules.json";
import type { Rarity } from "./rewards";

export interface LevelPoints {
  minResult: number; // min result % (0–100) for this level to earn points
  points: number; // invisible points awarded when the threshold is cleared
}

export interface RewardRules {
  dailyGoalSeconds: number;
  collectible: {
    enabled: boolean;
    // "points": earn a collectible by banking effort points (harder work, fewer
    //           sessions). "perSession": a roll every qualifying session.
    mode: "points" | "perSession";
    pointsPerCollectible: number; // points needed to win one (points mode)
    levelPoints: Record<string, LevelPoints>; // per-level points + threshold
    // perSession-mode knobs (ignored in points mode):
    sessionCooldown: number;
    minAccuracy: number;
    rarityWeights: Record<Rarity, number>;
    accuracyBoost: Record<Rarity, number>;
  };
  tickets: {
    enabled: boolean;
    perfectScoreChance: number;
    guaranteedOnLegendaryBadge: boolean;
    dailyCap: number;
  };
  badges: { enabled: boolean };
  // End-of-summer cash-out: total effort points × dollarsPerPoint. Points are a
  // cumulative score (never spent) — collectibles unlock at thresholds AND the
  // full total converts to dollars.
  redemption: { enabled: boolean; dollarsPerPoint: number };
}

export const DEFAULT_RULES: RewardRules = {
  dailyGoalSeconds: 1800,
  collectible: {
    enabled: true,
    mode: "points",
    pointsPerCollectible: 6,
    levelPoints: {
      hard: { minResult: 60, points: 6 }, // 1 hard session → a collectible
      medium: { minResult: 75, points: 3 }, // 2 medium sessions
      easy: { minResult: 90, points: 2 }, // 3 easy sessions
    },
    sessionCooldown: 0,
    minAccuracy: 0,
    rarityWeights: { common: 0.62, rare: 0.28, epic: 0.085, legendary: 0.015 },
    accuracyBoost: { common: -0.5, rare: 0.6, epic: 1.5, legendary: 2.0 },
  },
  tickets: {
    enabled: true,
    perfectScoreChance: 0.12,
    guaranteedOnLegendaryBadge: true,
    dailyCap: 2,
  },
  badges: { enabled: true },
  redemption: { enabled: true, dollarsPerPoint: 0.76 },
};

// Shallow-merge one level deep (enough for this config shape).
function merge<T>(base: T, override: unknown): T {
  if (!override || typeof override !== "object") return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    const baseVal = (base as Record<string, unknown>)[k];
    out[k] =
      baseVal && typeof baseVal === "object" && !Array.isArray(baseVal)
        ? merge(baseVal, v)
        : v;
  }
  return out as T;
}

export const RULES: RewardRules = merge(DEFAULT_RULES, rawRules);
