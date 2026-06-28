// Reward system — isomorphic definitions and pure logic shared by the API
// (award evaluation) and the client (trophy room, earn popup).
//
// Design (see product notes): three layers tuned to keep kids engaged without
// the overjustification trap.
//   1. Mastery badges  — predictable, earnable, reward effort & bravery.
//   2. Collectibles    — variable rarity drops, a set to complete (anti-boredom).
//   3. Golden Tickets  — rare, real-world, experiential/relational rewards.
// Plus cooperative family goals so the three sisters pull together rather than
// compete across an unfair age gap.

// Badge definitions live in an editable JSON file (metadata + declarative
// criteria); the logic to evaluate them is built below.
import badgesData from "../../badges.json";

export type Rarity = "common" | "rare" | "epic" | "legendary";

// ---------------------------------------------------------------------------
// Earned-reward shapes — returned by the award engine and consumed by the
// client (earn popup). Kept here so client code needn't import server modules.
// ---------------------------------------------------------------------------
export interface EarnedBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: Rarity;
}

export interface EarnedCollectible {
  id: string; // figure id, e.g. "iris_doctor"
  name: string; // theme name, e.g. "Doctor"
  icon: string; // emoji fallback
  rarity: Rarity;
  figureGirl: string; // whose face, e.g. "iris"
  image: string; // /collectibles/<id>.png
}

export interface EarnedTicket {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface EarnedFamilyGoal {
  id: string;
  name: string;
  reward: string;
  icon: string;
}

export interface EarnedRewards {
  badges: EarnedBadge[];
  collectible: EarnedCollectible | null;
  tickets: EarnedTicket[];
  familyGoals: EarnedFamilyGoal[];
  pointsEarned: number; // effort points banked this session (round 1 only)
}

export const RARITY_META: Record<
  Rarity,
  { label: string; color: string; glow: string; weight: number }
> = {
  common: { label: "Common", color: "#9ca3af", glow: "#d1d5db", weight: 0.62 },
  rare: { label: "Rare", color: "#3b82f6", glow: "#93c5fd", weight: 0.28 },
  epic: { label: "Epic", color: "#a855f7", glow: "#d8b4fe", weight: 0.085 },
  legendary: {
    label: "Legendary",
    color: "#f59e0b",
    glow: "#fde68a",
    weight: 0.015,
  },
};

// ---------------------------------------------------------------------------
// Stats — computed from quiz_results, fed into badge checks.
// ---------------------------------------------------------------------------
export interface UserStats {
  sessions: number;
  totalProblems: number;
  totalCorrect: number;
  perfectScores: number;
  hardCompleted: number;
  comebacks: number; // aced a retry round (round > 1, perfect)
  topicsMastered: number; // distinct training topics with a perfect score
  currentStreak: number; // consecutive active days up to today
  bestStreak: number;
}

export const EMPTY_STATS: UserStats = {
  sessions: 0,
  totalProblems: 0,
  totalCorrect: 0,
  perfectScores: 0,
  hardCompleted: 0,
  comebacks: 0,
  topicsMastered: 0,
  currentStreak: 0,
  bestStreak: 0,
};

// ---------------------------------------------------------------------------
// Layer 1 — Mastery badges
// ---------------------------------------------------------------------------
export interface BadgeDef {
  id: string;
  name: string;
  description: string; // process-praise framing ("you practised…"), not "you're smart"
  icon: string;
  rarity: Rarity;
  check: (s: UserStats) => boolean;
  // Optional progress toward earning, for locked badges in the trophy room.
  progress?: (s: UserStats) => { current: number; target: number };
}

type StatKey =
  | "sessions"
  | "totalProblems"
  | "totalCorrect"
  | "perfectScores"
  | "hardCompleted"
  | "comebacks"
  | "topicsMastered"
  | "currentStreak"
  | "bestStreak"
  | "accuracy";

type Criterion = { stat: StatKey; gte: number } | { all: Criterion[] };

interface BadgeJson {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: Rarity;
  criteria: Criterion;
}

function statValue(s: UserStats, key: StatKey): number {
  if (key === "accuracy") {
    return s.totalProblems > 0 ? s.totalCorrect / s.totalProblems : 0;
  }
  return (s as unknown as Record<string, number>)[key];
}

function meetsCriterion(c: Criterion, s: UserStats): boolean {
  return "all" in c
    ? c.all.every((x) => meetsCriterion(x, s))
    : statValue(s, c.stat) >= c.gte;
}

// First count-based criterion — drives the locked-badge progress bar.
function primaryCriterion(c: Criterion): { stat: StatKey; gte: number } | null {
  if ("all" in c) {
    for (const x of c.all) {
      const p = primaryCriterion(x);
      if (p) return p;
    }
    return null;
  }
  return c;
}

// Built from badges.json so copy/icons/rarity/thresholds are editable there.
export const BADGES: BadgeDef[] = (
  badgesData.badges as unknown as BadgeJson[]
).map((b) => {
  const primary = primaryCriterion(b.criteria);
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    icon: b.icon,
    rarity: b.rarity,
    check: (s: UserStats) => meetsCriterion(b.criteria, s),
    progress: primary
      ? (s: UserStats) => ({
          current: Math.min(statValue(s, primary.stat), primary.gte),
          target: primary.gte,
        })
      : undefined,
  };
});

export const BADGES_BY_ID: Record<string, BadgeDef> = Object.fromEntries(
  BADGES.map((b) => [b.id, b]),
);

/// Artwork path for a badge medallion (see agents/badge-designer). Files live
/// in /public/badges/<id>.png. The `icon` emoji stays as a fallback.
export function badgeImage(id: string): string {
  return `/badges/${id}.png`;
}

export function evaluateBadges(stats: UserStats): string[] {
  return BADGES.filter((b) => b.check(stats)).map((b) => b.id);
}

// ---------------------------------------------------------------------------
// Layer 2 — Collectibles: personalized action-figure cards, one per theme.
// Each girl collects her OWN version of every figure (her face on the toy), so
// the artwork is per-user: /collectibles/<girl>_<id>.png (see collectibleImage).
// ---------------------------------------------------------------------------
export interface CollectibleDef {
  id: string;
  name: string;
  icon: string; // emoji fallback (used before art loads / in compact UIs)
  rarity: Rarity;
}

export const COLLECTIBLE_SET = "Dolls 2026";

export const COLLECTIBLES: CollectibleDef[] = [
  // Common
  { id: "explorer", name: "Explorer", icon: "🧭", rarity: "common" },
  { id: "clown", name: "Clown", icon: "🤡", rarity: "common" },
  { id: "golfer", name: "Golfer", icon: "⛳", rarity: "common" },
  { id: "police", name: "Police Officer", icon: "👮", rarity: "common" },
  { id: "doctor", name: "Doctor", icon: "🩺", rarity: "common" },
  { id: "beachpro", name: "Beach Pro", icon: "🏖️", rarity: "common" },
  { id: "librarian", name: "Bookworm", icon: "📚", rarity: "common" },
  { id: "scout", name: "Scout", icon: "🏕️", rarity: "common" },
  { id: "farmer", name: "Orchard Farmer", icon: "🍎", rarity: "common" },
  { id: "catcher", name: "Critter Catcher", icon: "🪲", rarity: "common" },
  // Rare
  { id: "swimmer", name: "Swimmer", icon: "🏊", rarity: "rare" },
  { id: "gymnast", name: "Gymnast", icon: "🤸", rarity: "rare" },
  { id: "tennis", name: "Tennis Pro", icon: "🎾", rarity: "rare" },
  { id: "skier", name: "Skier", icon: "⛷️", rarity: "rare" },
  { id: "snowboarder", name: "Snowboarder", icon: "🏂", rarity: "rare" },
  { id: "firefighter", name: "Firefighter", icon: "🚒", rarity: "rare" },
  { id: "vet", name: "Vet", icon: "🐾", rarity: "rare" },
  { id: "skater", name: "Skater", icon: "🛹", rarity: "rare" },
  // Epic
  { id: "ballet", name: "Ballet Star", icon: "🩰", rarity: "epic" },
  { id: "surfer", name: "Surfer", icon: "🏄", rarity: "epic" },
  { id: "actor", name: "Actor", icon: "🎭", rarity: "epic" },
  { id: "businesswoman", name: "CEO", icon: "💼", rarity: "epic" },
  { id: "nerd", name: "Inventor", icon: "🤓", rarity: "epic" },
  // Legendary
  { id: "astronaut", name: "Astronaut", icon: "🚀", rarity: "legendary" },
  { id: "dreamer", name: "Dreamer", icon: "💫", rarity: "legendary" },
];

/// Per-girl artwork path for a collectible theme. `girl` is the lowercased
/// first name (zoe/iris/rose), matching the files in /public/collectibles.
export function collectibleImage(girl: string, id: string): string {
  return `/collectibles/${girl.toLowerCase()}_${id}.png`;
}

export const COLLECTIBLES_BY_ID: Record<string, CollectibleDef> =
  Object.fromEntries(COLLECTIBLES.map((c) => [c.id, c]));

// ---------------------------------------------------------------------------
// Figures — the shared family deck. Every (girl × theme) is ONE unique card.
// A drop awards a random not-yet-won figure to whoever earned it (so Zoe can
// collect "Iris as Doctor"). 75 cards total; each won exactly once, family-wide.
// ---------------------------------------------------------------------------
export const FIGURE_GIRLS = ["zoe", "iris", "rose"] as const;
export type FigureGirl = (typeof FIGURE_GIRLS)[number];

export interface FigureDef {
  id: string; // `${girl}_${themeId}` — matches the image filename stem
  girl: FigureGirl;
  themeId: string;
  name: string; // theme display name
  icon: string;
  rarity: Rarity; // cosmetic only (drops are uniform random)
  image: string; // /collectibles/<id>.png
}

export const FIGURES: FigureDef[] = FIGURE_GIRLS.flatMap((girl) =>
  COLLECTIBLES.map((t) => ({
    id: `${girl}_${t.id}`,
    girl,
    themeId: t.id,
    name: t.name,
    icon: t.icon,
    rarity: t.rarity,
    image: `/collectibles/${girl}_${t.id}.png`,
  })),
);

export const FIGURES_BY_ID: Record<string, FigureDef> = Object.fromEntries(
  FIGURES.map((f) => [f.id, f]),
);

export const FAMILY_DECK_SIZE = FIGURES.length; // 75

// Draw a uniformly random figure not already in `wonIds`, or null if the deck
// is complete. Pure random — rarity is cosmetic, not weighted (per design).
export function drawFigure(
  wonIds: Set<string>,
  rng = Math.random,
): FigureDef | null {
  const remaining = FIGURES.filter((f) => !wonIds.has(f.id));
  if (remaining.length === 0) return null;
  return remaining[Math.floor(rng() * remaining.length)];
}

const COLLECTIBLES_BY_RARITY: Record<Rarity, CollectibleDef[]> = {
  common: COLLECTIBLES.filter((c) => c.rarity === "common"),
  rare: COLLECTIBLES.filter((c) => c.rarity === "rare"),
  epic: COLLECTIBLES.filter((c) => c.rarity === "epic"),
  legendary: COLLECTIBLES.filter((c) => c.rarity === "legendary"),
};

// Default rarity odds + accuracy-boost multipliers. The reward-rules config can
// override these (see lib/reward-rules.ts); defaults keep standalone callers
// (e.g. the seed script) working unchanged.
const DEFAULT_RARITY_WEIGHTS: Record<Rarity, number> = {
  common: RARITY_META.common.weight,
  rare: RARITY_META.rare.weight,
  epic: RARITY_META.epic.weight,
  legendary: RARITY_META.legendary.weight,
};
const DEFAULT_ACCURACY_BOOST: Record<Rarity, number> = {
  common: -0.5,
  rare: 0.6,
  epic: 1.5,
  legendary: 2.0,
};

// Roll a rarity. Higher accuracy nudges luck upward (skill is rewarded) while
// finishing at all always yields *something* (effort always pays). Weights and
// per-rarity accuracy-boost multipliers are configurable.
export function rollRarity(
  accuracyRatio: number,
  rng = Math.random,
  baseWeights: Record<Rarity, number> = DEFAULT_RARITY_WEIGHTS,
  boostMul: Record<Rarity, number> = DEFAULT_ACCURACY_BOOST,
): Rarity {
  const boost = Math.max(0, Math.min(1, (accuracyRatio - 0.6) / 0.4)); // 0..1 above 60%
  const weights: Record<Rarity, number> = {
    common: baseWeights.common * (1 + boostMul.common * boost),
    rare: baseWeights.rare * (1 + boostMul.rare * boost),
    epic: baseWeights.epic * (1 + boostMul.epic * boost),
    legendary: baseWeights.legendary * (1 + boostMul.legendary * boost),
  };
  const total = weights.common + weights.rare + weights.epic + weights.legendary;
  let r = rng() * total;
  for (const rarity of ["legendary", "epic", "rare", "common"] as Rarity[]) {
    if (r < weights[rarity]) return rarity;
    r -= weights[rarity];
  }
  return "common";
}

export function rollCollectible(
  accuracyRatio: number,
  rng = Math.random,
  baseWeights?: Record<Rarity, number>,
  boostMul?: Record<Rarity, number>,
): CollectibleDef {
  const rarity = rollRarity(accuracyRatio, rng, baseWeights, boostMul);
  const pool = COLLECTIBLES_BY_RARITY[rarity];
  return pool[Math.floor(rng() * pool.length)];
}

// ---------------------------------------------------------------------------
// Layer 3 — Golden Tickets (experiential / relational rewards)
// ---------------------------------------------------------------------------
export interface TicketDef {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export const TICKETS: TicketDef[] = [
  {
    id: "movie-pick",
    name: "Movie Night Pick",
    icon: "🎬",
    description: "You choose the next family movie!",
  },
  {
    id: "stay-up",
    name: "Stay Up Late",
    icon: "🌙",
    description: "Stay up 20 extra minutes one night.",
  },
  {
    id: "one-on-one",
    name: "Special Time",
    icon: "💛",
    description: "30 minutes of one-on-one time, your pick.",
  },
  {
    id: "baking",
    name: "Bake Together",
    icon: "🧁",
    description: "Bake your favourite treat with a grown-up.",
  },
  {
    id: "hug",
    name: "Giant Hug",
    icon: "🤗",
    description: "Redeem for one enormous hug!",
  },
  {
    id: "dinner-pick",
    name: "Dinner Chooser",
    icon: "🍝",
    description: "You pick what's for dinner.",
  },
  {
    id: "game-night",
    name: "Game Night Pick",
    icon: "🎲",
    description: "Choose the family game night game.",
  },
  {
    id: "ice-cream",
    name: "Ice Cream Trip",
    icon: "🍦",
    description: "A trip out for ice cream together.",
  },
];

export const TICKETS_BY_ID: Record<string, TicketDef> = Object.fromEntries(
  TICKETS.map((t) => [t.id, t]),
);

// Probability of winning a Golden Ticket on a perfect score. Kept low so they
// stay magical and don't commodify learning.
export const TICKET_PERFECT_CHANCE = 0.12;

export function rollTicket(rng = Math.random): TicketDef {
  return TICKETS[Math.floor(rng() * TICKETS.length)];
}

// ---------------------------------------------------------------------------
// Cooperative family goals (computed across all sisters)
// ---------------------------------------------------------------------------
export interface FamilyGoalDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  reward: string;
  metric: "badges" | "collectibles" | "allWeekStreak";
  target: number;
}

export const FAMILY_GOALS: FamilyGoalDef[] = [
  {
    id: "fam-badges-50",
    name: "Badge Brigade",
    description: "Earn 50 badges together as a family",
    icon: "🍕",
    reward: "Family Pizza Night",
    metric: "badges",
    target: 50,
  },
  {
    id: "fam-collectibles-60",
    name: "Critter Crew",
    description: "Collect 60 critters between you",
    icon: "🎢",
    reward: "A Family Day Out",
    metric: "collectibles",
    target: 60,
  },
  {
    id: "fam-all-week",
    name: "All Together Now",
    description: "Every sister hits a 7-day streak",
    icon: "🎬",
    reward: "Family Movie Marathon",
    metric: "allWeekStreak",
    target: 3,
  },
];

export const FAMILY_GOALS_BY_ID: Record<string, FamilyGoalDef> =
  Object.fromEntries(FAMILY_GOALS.map((g) => [g.id, g]));

// ---------------------------------------------------------------------------
// Streak helper — longest & current run of "maintained" days, in calendar days.
//
// Weekend-forgiving with make-up: practice is expected on weekdays; weekends are
// free. The streak only breaks on a **missed weekday that isn't made up**. Each
// weekend session that same week (Mon–Sun) earns one make-up credit that
// forgives one missed weekday in that week — so a girl who misses, say, a
// Wednesday can catch up on Saturday and keep her streak alive.
//
// `dates` are "YYYY-MM-DD" strings (any order); `today` is the same format.
// ---------------------------------------------------------------------------
const DAY_MS = 86400000;
const parseDay = (d: string) =>
  Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fmtDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const isWeekendMs = (t: number) => {
  const d = new Date(t).getUTCDay();
  return d === 0 || d === 6; // Sun or Sat
};
const mondayMs = (t: number) => t - (((new Date(t).getUTCDay() + 6) % 7) * DAY_MS);

export function computeStreaks(
  dates: string[],
  today: string,
): { current: number; best: number } {
  if (dates.length === 0) return { current: 0, best: 0 };
  const set = new Set(dates);
  const todayMs = parseDay(today);
  const activeMs = [...set]
    .map(parseDay)
    .filter((t) => t <= todayMs)
    .sort((a, b) => a - b);
  if (activeMs.length === 0) return { current: 0, best: 0 };
  const startMs = activeMs[0];

  // Tally per-week weekend make-up credits and the missed weekdays they cover.
  const credits = new Map<number, number>();
  const missedByWeek = new Map<number, number[]>();
  for (let t = startMs; t <= todayMs; t += DAY_MS) {
    const wk = mondayMs(t);
    const active = set.has(fmtDay(t));
    if (isWeekendMs(t)) {
      if (active) credits.set(wk, (credits.get(wk) ?? 0) + 1);
    } else if (!active) {
      const list = missedByWeek.get(wk) ?? [];
      list.push(t);
      missedByWeek.set(wk, list);
    }
  }

  // A missed weekday is "uncovered" (breaks the run) only once that week's
  // make-up credits are exhausted.
  const uncovered = new Set<number>();
  for (const [wk, missed] of missedByWeek) {
    const c = credits.get(wk) ?? 0;
    missed.sort((a, b) => a - b);
    for (let i = c; i < missed.length; i++) uncovered.add(missed[i]);
  }
  const covered = (t: number) => !uncovered.has(t);

  // Best run of consecutive covered calendar days within [start, today].
  // A run that contains no actual activity (e.g. a lone free weekend) is not a
  // streak, so it only counts once it includes at least one active day.
  let best = 0;
  let run = 0;
  let runActive = false;
  for (let t = startMs; t <= todayMs; t += DAY_MS) {
    if (covered(t)) {
      run++;
      if (set.has(fmtDay(t))) runActive = true;
      if (runActive) best = Math.max(best, run);
    } else {
      run = 0;
      runActive = false;
    }
  }

  // Current run = trailing covered days ending today. Free weekend days keep an
  // existing streak alive, but a trailing run made up ONLY of inactive days
  // (e.g. today is the weekend and there was no recent activity) is not a streak.
  let current = 0;
  let currentActive = false;
  for (let t = todayMs; t >= startMs && covered(t); t -= DAY_MS) {
    current++;
    if (set.has(fmtDay(t))) currentActive = true;
  }
  if (!currentActive) current = 0;

  return { current, best };
}
