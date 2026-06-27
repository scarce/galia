// Seed realistic local data for the three girls.
//   node scripts/seed.mjs            (uses postgres://localhost:5432/galia)
//   POSTGRES_URL=... node scripts/seed.mjs
//
// Deterministic (seeded RNG) so reruns are stable. Wipes and repopulates
// quiz_results + all reward tables with internally-consistent state (badges
// match the generated stats, collectibles accumulate from simulated drops,
// tickets drop on perfect scores / legendary badges).
import pg from "pg";

const URL = process.env.POSTGRES_URL || "postgres://localhost:5432/galia";

// ── seeded RNG ──────────────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── reward defs (mirror of src/lib/rewards.ts, inlined for the script) ────
const RARITY_WEIGHT = { common: 0.62, rare: 0.28, epic: 0.085, legendary: 0.015 };
const COLLECTIBLES = [
  ["explorer", "common"], ["clown", "common"], ["golfer", "common"],
  ["police", "common"], ["doctor", "common"], ["beachpro", "common"],
  ["librarian", "common"], ["scout", "common"], ["farmer", "common"],
  ["catcher", "common"], ["swimmer", "rare"], ["gymnast", "rare"],
  ["tennis", "rare"], ["skier", "rare"], ["snowboarder", "rare"],
  ["firefighter", "rare"], ["vet", "rare"], ["skater", "rare"],
  ["ballet", "epic"], ["surfer", "epic"], ["actor", "epic"],
  ["businesswoman", "epic"], ["nerd", "epic"], ["astronaut", "legendary"],
  ["dreamer", "legendary"],
].map(([id, rarity]) => ({ id, rarity }));
const BY_RARITY = {
  common: COLLECTIBLES.filter((c) => c.rarity === "common"),
  rare: COLLECTIBLES.filter((c) => c.rarity === "rare"),
  epic: COLLECTIBLES.filter((c) => c.rarity === "epic"),
  legendary: COLLECTIBLES.filter((c) => c.rarity === "legendary"),
};
const TICKETS = [
  "movie-pick", "stay-up", "one-on-one", "baking", "hug",
  "dinner-pick", "game-night", "ice-cream",
];
const FAMILY_GOALS = [
  { id: "fam-badges-50", metric: "badges", target: 50 },
  { id: "fam-collectibles-60", metric: "collectibles", target: 60 },
  { id: "fam-all-week", metric: "allWeekStreak", target: 3 },
];

function rollRarity(acc, rng) {
  const boost = Math.max(0, Math.min(1, (acc - 0.6) / 0.4));
  const w = {
    common: RARITY_WEIGHT.common * (1 - 0.5 * boost),
    rare: RARITY_WEIGHT.rare * (1 + 0.6 * boost),
    epic: RARITY_WEIGHT.epic * (1 + 1.5 * boost),
    legendary: RARITY_WEIGHT.legendary * (1 + 2 * boost),
  };
  const total = w.common + w.rare + w.epic + w.legendary;
  let r = rng() * total;
  for (const k of ["legendary", "epic", "rare", "common"]) {
    if (r < w[k]) return k;
    r -= w[k];
  }
  return "common";
}
function rollCollectible(acc, rng) {
  const pool = BY_RARITY[rollRarity(acc, rng)];
  return pool[Math.floor(rng() * pool.length)];
}

const badgeChecks = [
  ["first-steps", (s) => s.sessions >= 1],
  ["ten-quizzes", (s) => s.sessions >= 10],
  ["century", (s) => s.totalProblems >= 100],
  ["five-hundred", (s) => s.totalProblems >= 500],
  ["math-machine", (s) => s.totalProblems >= 1000],
  ["flawless", (s) => s.perfectScores >= 1],
  ["perfectionist", (s) => s.perfectScores >= 10],
  ["sharp-shooter", (s) => s.perfectScores >= 25],
  ["on-a-roll", (s) => s.bestStreak >= 3],
  ["week-warrior", (s) => s.bestStreak >= 7],
  ["fortnight", (s) => s.bestStreak >= 14],
  ["unstoppable", (s) => s.bestStreak >= 30],
  ["comeback-kid", (s) => s.comebacks >= 1],
  ["daredevil", (s) => s.hardCompleted >= 1],
  ["brave-heart", (s) => s.hardCompleted >= 10],
  ["topic-tamer", (s) => s.topicsMastered >= 3],
  ["topic-master", (s) => s.topicsMastered >= 5],
  ["accuracy-ace", (s) => s.totalProblems >= 200 && s.totalCorrect / s.totalProblems >= 0.9],
];

const GRADE_THEMES = {
  2: [
    ["addition", "Addition"], ["subtraction", "Subtraction"],
    ["number-lines", "Number Lines"], ["counting-large-numbers", "Counting Large Numbers"],
    ["time-and-calendar", "Time & Calendar"],
  ],
  4: [
    ["properties-of-operations", "Properties of Operations"],
    ["order-of-operations", "Order of Operations"],
    ["word-problems", "Word Problems"], ["work-rate", "Rate & Proportion"],
  ],
  5: [
    ["algebra", "Algebra"], ["order-of-operations", "Order of Operations"],
    ["work-rate", "Rate & Proportion"], ["geometry", "Geometry"],
    ["properties-of-operations", "Properties of Operations"],
    ["word-problems", "Word Problems"], ["logic-gates", "Logic & Binary"],
    ["computer-science", "Computer Science"],
  ],
};

// ── per-girl narratives ───────────────────────────────────────────────────
const GIRLS = [
  { id: "Z", name: "Zoe", grade: 5, seed: 5, historyDays: 40, activeProb: 0.82,
    currentStreak: 16, minDay: 30, maxDay: 52, accMean: 0.9, accSd: 0.06,
    hardFrac: 0.32, twoSessionProb: 0.5, redeemFirstTicket: true },
  { id: "I", name: "Iris", grade: 4, seed: 4, historyDays: 32, activeProb: 0.62,
    currentStreak: 5, minDay: 22, maxDay: 38, accMean: 0.8, accSd: 0.09,
    hardFrac: 0.12, twoSessionProb: 0.25, redeemFirstTicket: false },
  { id: "R", name: "Rose", grade: 2, seed: 2, historyDays: 26, activeProb: 0.5,
    currentStreak: 3, minDay: 14, maxDay: 30, accMean: 0.7, accSd: 0.11,
    hardFrac: 0.0, twoSessionProb: 0.15, redeemFirstTicket: false },
];

const TOTAL_Q = 40;
const dayMs = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);

function computeStreaks(dates, today) {
  if (!dates.length) return { current: 0, best: 0 };
  const set = new Set(dates);
  const sorted = [...set].sort();
  const parse = (s) => new Date(s + "T00:00:00Z").getTime();
  let best = 1, run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = parse(sorted[i]) - parse(sorted[i - 1]) === dayMs ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const t = parse(today);
  let cursor = set.has(today) ? t : t - dayMs, cur = 0;
  while (set.has(iso(new Date(cursor)))) { cur++; cursor -= dayMs; }
  return { current: cur, best };
}

function gauss(rng, mean, sd) {
  const u = 1 - rng(), v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

async function main() {
  const client = new pg.Client({ connectionString: URL });
  await client.connect();
  console.log("connected:", URL);

  await client.query(`CREATE TABLE IF NOT EXISTS user_points (
    user_id VARCHAR(10) PRIMARY KEY,
    points INTEGER NOT NULL DEFAULT 0,
    collectibles_awarded INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`);
  // Shared family deck shape (migrate from any older shape).
  await client.query("DROP TABLE IF EXISTS user_collectibles");
  await client.query(`CREATE TABLE user_collectibles (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(10) NOT NULL,
    collectible_id VARCHAR(60) NOT NULL UNIQUE,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`);
  await client.query(
    "TRUNCATE quiz_results, user_badges, user_tickets, family_milestones, user_points RESTART IDENTITY",
  );

  // Effort-points config (mirror of reward-rules.json) for seeding cash value.
  const LEVEL_POINTS = {
    hard: { minResult: 60, points: 6 },
    medium: { minResult: 75, points: 3 },
    easy: { minResult: 90, points: 2 },
  };
  const POINTS_PER_COLLECTIBLE = 6;

  // Shared family deck: 75 figure ids = girls × themes.
  const FIGURE_IDS = ["zoe", "iris", "rose"].flatMap((face) =>
    COLLECTIBLES.map((t) => `${face}_${t.id}`),
  );
  const globalWon = new Set();

  const now = new Date();
  const today = iso(now);
  const familyOwned = []; // figures drawn per girl

  for (const g of GIRLS) {
    const rng = mulberry32(g.seed * 7919);
    const themes = GRADE_THEMES[g.grade];
    const sessions = []; // {date, themeId, themeName, score, level, time, round, test}

    for (let off = g.historyDays - 1; off >= 0; off--) {
      const forced = off < g.currentStreak;
      if (!forced && rng() > g.activeProb) continue;
      const date = new Date(now.getTime() - off * dayMs);
      const nSessions = rng() < g.twoSessionProb ? 2 : 1;
      const dayMinutes = g.minDay + rng() * (g.maxDay - g.minDay);
      for (let si = 0; si < nSessions; si++) {
        const [themeId, themeName] = themes[Math.floor(rng() * themes.length)];
        const level = rng() < g.hardFrac ? "hard" : rng() < 0.5 ? "medium" : "easy";
        let acc = Math.max(0.3, Math.min(1, gauss(rng, g.accMean, g.accSd)));
        let score = Math.round(acc * TOTAL_Q);
        // occasional clean perfect
        if (acc > 0.95 && rng() < 0.5) score = TOTAL_Q;
        score = Math.max(0, Math.min(TOTAL_Q, score));
        const time = Math.round(((dayMinutes * 60) / nSessions) * (0.85 + rng() * 0.3));
        // timestamp: afternoon + session offset
        const ts = new Date(date);
        ts.setHours(16 + si * 2, Math.floor(rng() * 59), 0, 0);
        sessions.push({
          date: iso(date), themeId, themeName, score, level,
          time, round: 1, test: rng() < 0.08, ts,
        });
      }
    }

    // A couple of "comeback" retries: round 2 perfect after a non-perfect day.
    const retryCount = g.id === "R" ? 1 : 2;
    let added = 0;
    for (const s of sessions) {
      if (added >= retryCount) break;
      if (!s.test && s.score < TOTAL_Q && s.score >= TOTAL_Q * 0.7) {
        const ts = new Date(s.ts.getTime() + 20 * 60000);
        sessions.push({
          date: s.date, themeId: s.themeId, themeName: s.themeName,
          score: TOTAL_Q, level: s.level, time: Math.round(s.time * 0.7),
          round: 2, test: false, ts,
        });
        added++;
      }
    }

    // insert quiz_results
    for (const s of sessions) {
      const avg = s.time / TOTAL_Q;
      await client.query(
        `INSERT INTO quiz_results (user_id,user_name,theme_id,theme_name,score,total_questions,
           total_time_seconds,avg_time_per_question,mistakes,all_answers,round,level,is_test_mode,session_id,completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'[]'::jsonb,'[]'::jsonb,$9,$10,$11,$12,$13)`,
        [g.id, g.name, `${s.themeId}-${s.level}`, s.themeName, s.score, TOTAL_Q,
         s.time, avg, s.round, s.level, s.test, `${g.id}-${s.themeId}-${s.date}-${s.round}`, s.ts.toISOString()],
      );
    }

    // stats
    const dates = [...new Set(sessions.map((s) => s.date))];
    const { current, best } = computeStreaks(dates, today);
    const stats = {
      sessions: sessions.length,
      totalProblems: sessions.length * TOTAL_Q,
      totalCorrect: sessions.reduce((a, s) => a + s.score, 0),
      perfectScores: sessions.filter((s) => s.score === TOTAL_Q).length,
      hardCompleted: sessions.filter((s) => s.level === "hard").length,
      comebacks: sessions.filter((s) => s.round > 1 && s.score === TOTAL_Q && !s.test).length,
      topicsMastered: new Set(sessions.filter((s) => !s.test && s.score === TOTAL_Q).map((s) => s.themeId)).size,
      currentStreak: current, bestStreak: best,
    };

    // badges
    const earnedBadges = badgeChecks.filter(([, fn]) => fn(stats)).map(([id]) => id);
    for (const id of earnedBadges) {
      const ago = Math.floor(rng() * Math.min(stats.bestStreak + 3, 30));
      await client.query(
        "INSERT INTO user_badges (user_id,badge_id,earned_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [g.id, id, new Date(now.getTime() - ago * dayMs).toISOString()],
      );
    }

    // effort points → number of collectibles this girl earned
    let points = 0;
    for (const s of sessions) {
      const lvl = LEVEL_POINTS[s.level];
      if (lvl && (s.score / TOTAL_Q) * 100 >= lvl.minResult) points += lvl.points;
    }
    const collectiblesAwarded = Math.floor(points / POINTS_PER_COLLECTIBLE);

    // Shared family deck: draw that many UNIQUE random figures (any sister's
    // face) from the remaining global pool, owned by this girl.
    const drawn = [];
    for (let i = 0; i < collectiblesAwarded; i++) {
      const remaining = FIGURE_IDS.filter((id) => !globalWon.has(id));
      if (remaining.length === 0) break;
      const id = remaining[Math.floor(rng() * remaining.length)];
      globalWon.add(id);
      drawn.push(id);
      const ago = Math.floor(rng() * 50);
      await client.query(
        `INSERT INTO user_collectibles (user_id,collectible_id,earned_at) VALUES ($1,$2,$3)`,
        [g.id, id, new Date(now.getTime() - ago * dayMs).toISOString()],
      );
    }
    familyOwned.push(drawn.length);

    // tickets: perfect-score chance + a guaranteed one if a legendary figure dropped
    const tickets = [];
    for (const s of sessions) {
      if (s.score === TOTAL_Q && rng() < 0.12) tickets.push(TICKETS[Math.floor(rng() * TICKETS.length)]);
    }
    const gotLegendary = drawn.some((id) => {
      const theme = id.slice(id.indexOf("_") + 1);
      return COLLECTIBLES.find((c) => c.id === theme)?.rarity === "legendary";
    });
    if (gotLegendary) tickets.push(TICKETS[Math.floor(rng() * TICKETS.length)]);
    // cap to keep it special
    const finalTickets = tickets.slice(0, g.id === "Z" ? 3 : g.id === "I" ? 1 : 1);
    for (let i = 0; i < finalTickets.length; i++) {
      const redeemed = i === 0 && g.redeemFirstTicket;
      const wonAgo = Math.floor(rng() * 20);
      await client.query(
        `INSERT INTO user_tickets (user_id,user_name,ticket_id,status,won_at,redeemed_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [g.id, g.name, finalTickets[i], redeemed ? "redeemed" : "unredeemed",
         new Date(now.getTime() - wonAgo * dayMs).toISOString(),
         redeemed ? new Date(now.getTime() - (wonAgo - 1) * dayMs).toISOString() : null],
      );
    }

    // persist effort points + cash value (points mode)
    await client.query(
      `INSERT INTO user_points (user_id, points, collectibles_awarded)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET points = $2, collectibles_awarded = $3`,
      [g.id, points, collectiblesAwarded],
    );

    console.log(
      `${g.name}: ${sessions.length} sessions, streak ${current}/${best}, ` +
      `${earnedBadges.length} badges, ${drawn.length} figures, ${finalTickets.length} tickets, ` +
      `${stats.perfectScores} perfects, ${points} pts (~$${(points * 0.76).toFixed(0)})`,
    );
  }

  // family milestones
  const badgeTotal = (await client.query("SELECT COUNT(*)::int n FROM user_badges")).rows[0].n;
  const critterTotal = familyOwned.reduce((a, b) => a + b, 0);
  // recompute per-user best streak for allWeekStreak
  const pairs = (await client.query(
    "SELECT user_id, to_char(completed_at,'YYYY-MM-DD') d FROM quiz_results GROUP BY user_id, to_char(completed_at,'YYYY-MM-DD')",
  )).rows;
  const byUser = {};
  for (const r of pairs) (byUser[r.user_id] ||= []).push(r.d);
  const usersWithWeek = Object.values(byUser).filter((ds) => computeStreaks(ds, today).best >= 7).length;
  const metrics = { badges: badgeTotal, collectibles: critterTotal, allWeekStreak: usersWithWeek };
  const metGoals = [];
  for (const goal of FAMILY_GOALS) {
    if (metrics[goal.metric] >= goal.target) {
      await client.query(
        "INSERT INTO family_milestones (goal_id) VALUES ($1) ON CONFLICT DO NOTHING",
        [goal.id],
      );
      metGoals.push(goal.id);
    }
  }
  console.log("family metrics:", metrics, "→ completed:", metGoals.join(", ") || "none");

  await client.end();
  console.log("✅ seed complete");
}

main().catch((e) => { console.error(e); process.exit(1); });
