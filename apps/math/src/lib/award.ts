// Server-side reward evaluation. Runs after a quiz result is saved; computes
// the player's stats, awards any newly-earned badges, rolls a collectible,
// rolls Golden Tickets, and checks cooperative family goals. All best-effort:
// failures here must never break result submission.

import { sql } from "@/lib/db";
import { Resend } from "resend";
import { RULES } from "./reward-rules";
import {
  BADGES_BY_ID,
  COLLECTIBLES_BY_ID,
  TICKETS_BY_ID,
  FAMILY_GOALS,
  FAMILY_GOALS_BY_ID,
  evaluateBadges,
  drawFigure,
  rollTicket,
  computeStreaks,
  type UserStats,
  type EarnedBadge,
  type EarnedCollectible,
  type EarnedTicket,
  type EarnedFamilyGoal,
  type EarnedRewards,
} from "./rewards";

export type {
  EarnedBadge,
  EarnedCollectible,
  EarnedTicket,
  EarnedFamilyGoal,
  EarnedRewards,
};

const EMPTY: EarnedRewards = {
  badges: [],
  collectible: null,
  tickets: [],
  familyGoals: [],
  pointsEarned: 0,
};

export async function ensureTables() {
  await sql`CREATE TABLE IF NOT EXISTS user_badges (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(10) NOT NULL,
    badge_id VARCHAR(50) NOT NULL,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, badge_id)
  )`;
  // Shared family deck: each figure (collectible_id, e.g. "iris_doctor") is
  // owned by exactly one girl — UNIQUE on collectible_id alone.
  await sql`CREATE TABLE IF NOT EXISTS user_collectibles (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(10) NOT NULL,
    collectible_id VARCHAR(60) NOT NULL UNIQUE,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS user_tickets (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(10) NOT NULL,
    user_name VARCHAR(50) NOT NULL,
    ticket_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'unredeemed',
    won_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    redeemed_at TIMESTAMP WITH TIME ZONE
  )`;
  await sql`CREATE TABLE IF NOT EXISTS family_milestones (
    id SERIAL PRIMARY KEY,
    goal_id VARCHAR(50) NOT NULL UNIQUE,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS user_points (
    user_id VARCHAR(10) PRIMARY KEY,
    points INTEGER NOT NULL DEFAULT 0,
    collectibles_awarded INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`;
}

// Cumulative effort points + cash value for a user (points-mode redemption).
export async function getPoints(
  userId: string,
): Promise<{ points: number; dollars: number }> {
  const row = await sql`SELECT points FROM user_points WHERE user_id = ${userId}`;
  const points = (row.rows[0]?.points as number) ?? 0;
  const rate = RULES.redemption.enabled ? RULES.redemption.dollarsPerPoint : 0;
  return { points, dollars: points * rate };
}

// How many quiz sessions the user has completed since their last collectible
// drop (Infinity if they've never dropped one). Drives `sessionCooldown`.
async function sessionsSinceLastCollectible(userId: string): Promise<number> {
  const last = await sql`
    SELECT MAX(earned_at) AS m FROM user_collectibles WHERE user_id = ${userId}
  `;
  const m = last.rows[0]?.m;
  if (!m) return Number.POSITIVE_INFINITY;
  const cnt = await sql`
    SELECT COUNT(*)::int AS n FROM quiz_results
    WHERE user_id = ${userId} AND completed_at > ${m}
  `;
  return cnt.rows[0].n as number;
}

export async function computeStats(userId: string): Promise<UserStats> {
  const agg = await sql`
    SELECT
      COUNT(*)::int AS sessions,
      COALESCE(SUM(total_questions), 0)::int AS total_problems,
      COALESCE(SUM(score), 0)::int AS total_correct,
      COUNT(*) FILTER (WHERE score = total_questions)::int AS perfect_scores,
      COUNT(*) FILTER (WHERE level = 'hard')::int AS hard_completed,
      COUNT(*) FILTER (WHERE round > 1 AND score = total_questions AND is_test_mode = false)::int AS comebacks
    FROM quiz_results
    WHERE user_id = ${userId}
  `;
  const topics = await sql`
    SELECT COUNT(DISTINCT theme_name)::int AS n
    FROM quiz_results
    WHERE user_id = ${userId} AND is_test_mode = false AND score = total_questions
  `;
  const dateRows = await sql`
    SELECT DISTINCT to_char(completed_at, 'YYYY-MM-DD') AS d
    FROM quiz_results WHERE user_id = ${userId}
  `;
  const todayRow = await sql`SELECT to_char(NOW(), 'YYYY-MM-DD') AS today`;
  const today = todayRow.rows[0].today as string;
  const dates = dateRows.rows.map((r) => r.d as string);
  const { current, best } = computeStreaks(dates, today);

  const a = agg.rows[0];
  return {
    sessions: a.sessions,
    totalProblems: a.total_problems,
    totalCorrect: a.total_correct,
    perfectScores: a.perfect_scores,
    hardCompleted: a.hard_completed,
    comebacks: a.comebacks,
    topicsMastered: topics.rows[0].n,
    currentStreak: current,
    bestStreak: best,
  };
}

// Read-only family-wide metric values, for the trophy room progress bars.
export async function getFamilyMetrics(): Promise<Record<string, number>> {
  const badgeCount = await sql`SELECT COUNT(*)::int AS n FROM user_badges`;
  const collectibleSum = await sql`SELECT COUNT(*)::int AS n FROM user_collectibles`;
  const pairs = await sql`
    SELECT user_id, to_char(completed_at, 'YYYY-MM-DD') AS d
    FROM quiz_results GROUP BY user_id, to_char(completed_at, 'YYYY-MM-DD')
  `;
  const todayRow = await sql`SELECT to_char(NOW(), 'YYYY-MM-DD') AS today`;
  const today = todayRow.rows[0].today as string;
  const byUser = new Map<string, string[]>();
  for (const r of pairs.rows) {
    const list = byUser.get(r.user_id as string) ?? [];
    list.push(r.d as string);
    byUser.set(r.user_id as string, list);
  }
  let usersWithWeek = 0;
  for (const dates of byUser.values()) {
    if (computeStreaks(dates, today).best >= 7) usersWithWeek++;
  }
  return {
    badges: badgeCount.rows[0].n,
    collectibles: collectibleSum.rows[0].n,
    allWeekStreak: usersWithWeek,
  };
}

async function checkFamilyGoals(): Promise<EarnedFamilyGoal[]> {
  // Family-wide aggregates.
  const badgeCount = await sql`SELECT COUNT(*)::int AS n FROM user_badges`;
  const collectibleSum = await sql`SELECT COUNT(*)::int AS n FROM user_collectibles`;
  const pairs = await sql`
    SELECT user_id, to_char(completed_at, 'YYYY-MM-DD') AS d
    FROM quiz_results GROUP BY user_id, to_char(completed_at, 'YYYY-MM-DD')
  `;
  const todayRow = await sql`SELECT to_char(NOW(), 'YYYY-MM-DD') AS today`;
  const today = todayRow.rows[0].today as string;

  const byUser = new Map<string, string[]>();
  for (const r of pairs.rows) {
    const list = byUser.get(r.user_id as string) ?? [];
    list.push(r.d as string);
    byUser.set(r.user_id as string, list);
  }
  let usersWithWeek = 0;
  for (const dates of byUser.values()) {
    if (computeStreaks(dates, today).best >= 7) usersWithWeek++;
  }

  const metrics: Record<string, number> = {
    badges: badgeCount.rows[0].n,
    collectibles: collectibleSum.rows[0].n,
    allWeekStreak: usersWithWeek,
  };

  const earned: EarnedFamilyGoal[] = [];
  for (const goal of FAMILY_GOALS) {
    if (metrics[goal.metric] < goal.target) continue;
    // Record completion; only the first writer "earns" it.
    const res = await sql`
      INSERT INTO family_milestones (goal_id)
      VALUES (${goal.id})
      ON CONFLICT (goal_id) DO NOTHING
      RETURNING goal_id
    `;
    if (res.rows.length > 0) {
      earned.push({
        id: goal.id,
        name: goal.name,
        reward: goal.reward,
        icon: goal.icon,
      });
    }
  }
  return earned;
}

async function notifyParent(
  userName: string,
  tickets: EarnedTicket[],
  familyGoals: EarnedFamilyGoal[],
  collectible: EarnedCollectible | null,
  badges: EarnedBadge[],
) {
  const to = process.env.NOTIFICATION_EMAIL;
  if (!to || !process.env.RESEND_API_KEY) return;
  if (
    tickets.length === 0 &&
    familyGoals.length === 0 &&
    !collectible &&
    badges.length === 0
  )
    return;

  const lines: string[] = [];
  if (collectible) {
    lines.push(
      `🧸 ${userName} collected a new figure: ${collectible.icon} ${collectible.name} (${collectible.rarity})`,
    );
  }
  for (const b of badges) {
    lines.push(`🏅 ${userName} earned a badge: ${b.icon} ${b.name} — ${b.description}`);
  }
  for (const t of tickets) {
    lines.push(`🎫 ${userName} won a Golden Ticket: ${t.icon} ${t.name} — ${t.description}`);
  }
  for (const g of familyGoals) {
    lines.push(`🏠 Family goal complete: ${g.icon} ${g.name} → ${g.reward}`);
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "Galia <onboarding@resend.dev>",
      to,
      subject: `[galia/math] 🎉 ${userName} earned a real-world reward!`,
      text: `${lines.join("\n\n")}\n\nTime to make good on it 😊\n\n---\nGalamath Rewards`,
    });
  } catch (err) {
    console.error("Reward email error (continuing):", err);
  }
}

export async function awardRewards(opts: {
  userId: string;
  userName: string;
  sessionScore: number;
  sessionTotal: number;
  level?: string;
  round?: number;
}): Promise<EarnedRewards> {
  if (!process.env.POSTGRES_URL) return EMPTY;

  try {
    await ensureTables();

    const stats = await computeStats(opts.userId);
    const accuracyRatio =
      opts.sessionTotal > 0 ? opts.sessionScore / opts.sessionTotal : 0;

    // --- Layer 1: badges ---
    const newBadges: EarnedBadge[] = [];
    if (RULES.badges.enabled) {
      const satisfied = new Set(evaluateBadges(stats));
      const existing = await sql`
        SELECT badge_id FROM user_badges WHERE user_id = ${opts.userId}
      `;
      for (const row of existing.rows) satisfied.delete(row.badge_id as string);
      for (const id of satisfied) {
        const def = BADGES_BY_ID[id];
        if (!def) continue;
        await sql`
          INSERT INTO user_badges (user_id, badge_id)
          VALUES (${opts.userId}, ${id})
          ON CONFLICT (user_id, badge_id) DO NOTHING
        `;
        newBadges.push({
          id: def.id,
          name: def.name,
          description: def.description,
          icon: def.icon,
          rarity: def.rarity,
        });
      }
    }

    // Loot (points → collectibles, tickets) is granted on the FIRST round only,
    // using that round's result — retries can't farm rewards. Badges (above)
    // are cumulative and evaluate every round.
    const isFirstRound = (opts.round ?? 1) === 1;

    // --- Layer 2: collectible ---
    const cfg = RULES.collectible;
    let collectible: EarnedCollectible | null = null;
    let pointsEarned = 0;
    const awardCollectible = async () => {
      // Shared family deck: draw a random figure not yet won by ANYONE.
      const won = await sql`SELECT collectible_id FROM user_collectibles`;
      const wonSet = new Set(won.rows.map((r) => r.collectible_id as string));
      const fig = drawFigure(wonSet, Math.random);
      if (!fig) return; // deck complete
      const ins = await sql`
        INSERT INTO user_collectibles (user_id, collectible_id)
        VALUES (${opts.userId}, ${fig.id})
        ON CONFLICT (collectible_id) DO NOTHING
        RETURNING collectible_id
      `;
      if (ins.rows.length === 0) return; // raced — someone just won it
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
      // Cumulative effort points: harder levels earn more (gated by a per-level
      // result threshold). A collectible unlocks each pointsPerCollectible
      // milestone; the running total feeds the end-of-summer cash-out.
      const lvl = cfg.levelPoints[opts.level ?? ""];
      pointsEarned =
        lvl && accuracyRatio * 100 >= lvl.minResult ? lvl.points : 0;
      const row = await sql`
        INSERT INTO user_points (user_id, points, collectibles_awarded)
        VALUES (${opts.userId}, ${pointsEarned}, 0)
        ON CONFLICT (user_id)
        DO UPDATE SET points = user_points.points + ${pointsEarned}, updated_at = NOW()
        RETURNING points, collectibles_awarded
      `;
      const points = row.rows[0].points as number;
      const awarded = row.rows[0].collectibles_awarded as number;
      const milestones = Math.floor(points / cfg.pointsPerCollectible);
      if (milestones > awarded) {
        await sql`UPDATE user_points SET collectibles_awarded = ${milestones} WHERE user_id = ${opts.userId}`;
        await awardCollectible();
      }
    } else if (isFirstRound && cfg.enabled) {
      // perSession mode: a roll every qualifying session (min accuracy + cooldown).
      const cooldownOk =
        cfg.sessionCooldown <= 0 ||
        (await sessionsSinceLastCollectible(opts.userId)) > cfg.sessionCooldown;
      if (accuracyRatio >= cfg.minAccuracy && cooldownOk) {
        await awardCollectible();
      }
    }

    // --- Layer 3: Golden Tickets (first round only; chance, legendary, daily cap) ---
    const tickets: EarnedTicket[] = [];
    if (isFirstRound && RULES.tickets.enabled) {
      const isPerfect =
        opts.sessionTotal > 0 && opts.sessionScore === opts.sessionTotal;
      const wonLegendary = newBadges.some((b) => b.rarity === "legendary");
      let wins =
        (RULES.tickets.guaranteedOnLegendaryBadge && wonLegendary ? 1 : 0) +
        (isPerfect && Math.random() < RULES.tickets.perfectScoreChance ? 1 : 0);
      // Respect the per-day cap.
      const wonToday = await sql`
        SELECT COUNT(*)::int AS n FROM user_tickets
        WHERE user_id = ${opts.userId} AND won_at >= date_trunc('day', NOW())
      `;
      const remaining = Math.max(0, RULES.tickets.dailyCap - wonToday.rows[0].n);
      wins = Math.min(wins, remaining);
      for (let i = 0; i < wins; i++) {
        const t = rollTicket();
        await sql`
          INSERT INTO user_tickets (user_id, user_name, ticket_id)
          VALUES (${opts.userId}, ${opts.userName}, ${t.id})
        `;
        tickets.push({
          id: t.id,
          name: t.name,
          icon: t.icon,
          description: t.description,
        });
      }
    }

    // --- Cooperative family goals ---
    const familyGoals = await checkFamilyGoals();

    // --- Notify parent of real-world rewards ---
    await notifyParent(opts.userName, tickets, familyGoals, collectible, newBadges);

    return { badges: newBadges, collectible, tickets, familyGoals, pointsEarned };
  } catch (err) {
    console.error("Reward evaluation error (continuing):", err);
    return EMPTY;
  }
}

// Re-export definition maps for the read API to enrich stored rows.
export { BADGES_BY_ID, COLLECTIBLES_BY_ID, TICKETS_BY_ID, FAMILY_GOALS_BY_ID };
