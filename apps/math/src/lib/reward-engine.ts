// Pure, DB-free reward engine.
//
// This is the testable core of the reward logic: given accumulated state and a
// new quiz session, it decides which badges/collectibles/tickets are won — using
// the SAME definitions (rewards.ts) and tunable rules (reward-rules.json) as the
// production path. `award.ts` is the DB-backed counterpart that persists results;
// this module lets us simulate seasons of play deterministically (see
// scripts/simulate.ts and reward-engine.test.ts).
//
// Note: family goals are cross-user and live in award.ts; they are out of scope
// for this single-player engine.

import {
  BADGES_BY_ID,
  evaluateBadges,
  drawFigure,
  rollTicket,
  computeStreaks,
  type EarnedBadge,
  type EarnedCollectible,
  type EarnedTicket,
  type UserStats,
} from "./rewards";
import { RULES, type RewardRules } from "./reward-rules";

export interface EngineSession {
  date: string; // YYYY-MM-DD
  themeId: string;
  level: string; // easy | medium | hard
  score: number; // correct answers
  totalQuestions: number;
  round?: number; // 1 = first attempt; >1 = retry (for comebacks)
  isTest?: boolean;
}

export interface EngineState {
  sessions: number;
  totalProblems: number;
  totalCorrect: number;
  perfectScores: number;
  hardCompleted: number;
  comebacks: number;
  masteredTopics: Set<string>;
  activeDates: Set<string>;
  earnedBadgeIds: Set<string>;
  // Figures won so far (by id). In production this is family-wide (shared deck);
  // in the single-player simulator it's this player's deck.
  wonFigures: Set<string>;
  // Non-drop sessions since the last collectible (Infinity = none ever). The
  // "sessions since last drop" used by the cooldown is this + 1 (the current).
  sessionsSinceLastCollectible: number;
  // Cumulative effort points (points mode). Never spent: collectibles unlock at
  // thresholds AND the total converts to cash at end of summer.
  points: number;
  collectiblesAwarded: number; // milestones reached so far
  ticketsWonByDate: Record<string, number>;
}

export interface SessionRewards {
  badges: EarnedBadge[];
  collectible: EarnedCollectible | null;
  tickets: EarnedTicket[];
  pointsEarned: number;
}

export function initState(): EngineState {
  return {
    sessions: 0,
    totalProblems: 0,
    totalCorrect: 0,
    perfectScores: 0,
    hardCompleted: 0,
    comebacks: 0,
    masteredTopics: new Set(),
    activeDates: new Set(),
    earnedBadgeIds: new Set(),
    wonFigures: new Set(),
    sessionsSinceLastCollectible: Number.POSITIVE_INFINITY,
    points: 0,
    collectiblesAwarded: 0,
    ticketsWonByDate: {},
  };
}

export function statsFrom(state: EngineState, today: string): UserStats {
  const { current, best } = computeStreaks([...state.activeDates], today);
  return {
    sessions: state.sessions,
    totalProblems: state.totalProblems,
    totalCorrect: state.totalCorrect,
    perfectScores: state.perfectScores,
    hardCompleted: state.hardCompleted,
    comebacks: state.comebacks,
    topicsMastered: state.masteredTopics.size,
    currentStreak: current,
    bestStreak: best,
  };
}

// Apply one session, mutating `state`, returning what was newly won.
// Mirrors award.ts's decision order: badges → collectible (cooldown/min-acc) →
// tickets (perfect chance / legendary, daily cap).
export function applySession(
  state: EngineState,
  session: EngineSession,
  rng: () => number = Math.random,
  rules: RewardRules = RULES,
): SessionRewards {
  const total = session.totalQuestions;
  const score = Math.max(0, Math.min(session.score, total));
  const isPerfect = total > 0 && score >= total;
  const accuracy = total > 0 ? score / total : 0;

  // --- accumulate stats ---
  state.sessions += 1;
  state.totalProblems += total;
  state.totalCorrect += score;
  state.activeDates.add(session.date);
  if (isPerfect) {
    state.perfectScores += 1;
    if (!session.isTest) state.masteredTopics.add(session.themeId);
  }
  if (session.level === "hard") state.hardCompleted += 1;
  if ((session.round ?? 1) > 1 && isPerfect && !session.isTest) {
    state.comebacks += 1;
  }

  const stats = statsFrom(state, session.date);

  // --- Layer 1: badges ---
  const badges: EarnedBadge[] = [];
  if (rules.badges.enabled) {
    for (const id of evaluateBadges(stats)) {
      if (state.earnedBadgeIds.has(id)) continue;
      state.earnedBadgeIds.add(id);
      const def = BADGES_BY_ID[id];
      if (def) {
        badges.push({
          id: def.id,
          name: def.name,
          description: def.description,
          icon: def.icon,
          rarity: def.rarity,
        });
      }
    }
  }

  // Loot (points → collectibles, tickets) is granted on the FIRST round only,
  // using that round's result — so retries can't farm rewards. Badges (above)
  // are cumulative achievements and evaluate every round.
  const isFirstRound = (session.round ?? 1) === 1;

  // --- Layer 2: collectible ---
  const cfg = rules.collectible;
  let collectible: EarnedCollectible | null = null;
  let pointsEarned = 0;
  const award = () => {
    const fig = drawFigure(state.wonFigures, rng); // null if the deck is complete
    if (!fig) return;
    state.wonFigures.add(fig.id);
    collectible = {
      id: fig.id,
      name: fig.name,
      icon: fig.icon,
      rarity: fig.rarity,
      figureGirl: fig.girl,
      image: fig.image,
    };
  };

  if (isFirstRound && cfg.enabled && cfg.mode === "points") {
    // Effort points (cumulative, never spent): harder levels earn more, gated
    // by a per-level minimum result. A collectible unlocks each time the total
    // crosses another `pointsPerCollectible` milestone; the full total cashes
    // out at end of summer.
    const lvl = cfg.levelPoints[session.level];
    const resultPct = accuracy * 100;
    pointsEarned = lvl && resultPct >= lvl.minResult ? lvl.points : 0;
    state.points += pointsEarned;
    const milestones = Math.floor(state.points / cfg.pointsPerCollectible);
    if (milestones > state.collectiblesAwarded) {
      state.collectiblesAwarded = milestones;
      award();
    }
  } else if (isFirstRound && cfg.enabled) {
    // perSession: a roll every qualifying session (min accuracy + cooldown).
    const sessionsSince = state.sessionsSinceLastCollectible + 1; // include current
    const cooldownOk =
      cfg.sessionCooldown <= 0 || sessionsSince > cfg.sessionCooldown;
    if (accuracy >= cfg.minAccuracy && cooldownOk) {
      award();
      state.sessionsSinceLastCollectible = 0;
    } else {
      state.sessionsSinceLastCollectible = Number.isFinite(
        state.sessionsSinceLastCollectible,
      )
        ? state.sessionsSinceLastCollectible + 1
        : Number.POSITIVE_INFINITY;
    }
  }

  // --- Layer 3: Golden Tickets (first round only; chance/legendary, daily cap) ---
  const tickets: EarnedTicket[] = [];
  if (isFirstRound && rules.tickets.enabled) {
    const wonLegendary = badges.some((b) => b.rarity === "legendary");
    let wins =
      (rules.tickets.guaranteedOnLegendaryBadge && wonLegendary ? 1 : 0) +
      (isPerfect && rng() < rules.tickets.perfectScoreChance ? 1 : 0);
    const already = state.ticketsWonByDate[session.date] ?? 0;
    wins = Math.min(wins, Math.max(0, rules.tickets.dailyCap - already));
    for (let i = 0; i < wins; i++) {
      const t = rollTicket(rng);
      tickets.push({
        id: t.id,
        name: t.name,
        icon: t.icon,
        description: t.description,
      });
    }
    state.ticketsWonByDate[session.date] = already + tickets.length;
  }

  return { badges, collectible, tickets, pointsEarned };
}

// Deterministic RNG so simulations/tests are reproducible.
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DayRewards {
  date: string;
  badges: EarnedBadge[];
  collectibles: EarnedCollectible[];
  tickets: EarnedTicket[];
  points: number; // cumulative effort points at end of this day
  dollars: number; // cumulative cash value at end of this day
}

export interface SimulationResult {
  days: DayRewards[];
  finalStats: UserStats;
  state: EngineState;
  totalPoints: number;
  dollars: number; // end-of-summer cash-out
}

// Run a list of sessions (chronological order assumed) and aggregate the
// rewards won per day.
export function simulate(
  sessions: EngineSession[],
  opts: { seed?: number; rules?: RewardRules } = {},
): SimulationResult {
  const rng = mulberry32(opts.seed ?? 1);
  const rules = opts.rules ?? RULES;
  const rate = rules.redemption.enabled ? rules.redemption.dollarsPerPoint : 0;
  const state = initState();
  const dayMap = new Map<string, DayRewards>();
  const order: string[] = [];

  for (const s of sessions) {
    const r = applySession(state, s, rng, rules);
    let day = dayMap.get(s.date);
    if (!day) {
      day = { date: s.date, badges: [], collectibles: [], tickets: [], points: 0, dollars: 0 };
      dayMap.set(s.date, day);
      order.push(s.date);
    }
    day.badges.push(...r.badges);
    if (r.collectible) day.collectibles.push(r.collectible);
    day.tickets.push(...r.tickets);
    day.points = state.points; // cumulative running total
    day.dollars = state.points * rate;
  }

  const lastDate = sessions.length
    ? sessions[sessions.length - 1].date
    : "1970-01-01";
  return {
    days: order.map((d) => dayMap.get(d)!),
    finalStats: statsFrom(state, lastDate),
    state,
    totalPoints: state.points,
    dollars: state.points * rate,
  };
}
