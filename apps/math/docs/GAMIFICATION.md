# galia/math — Gamification & Rewards

This document explains the engagement system in galia/math: what it does, **why
it's designed this way**, how it's implemented, and where the tuning knobs are.

The app is a math-practice app built for three sisters — **Zoe (grade 5),
Iris (grade 4), Rose (grade 2)**. The goal of the gamification is to make daily
practice *genuinely* habit-forming **without** the failure modes that most
kids' reward systems fall into (bribery, boredom, unfairness across an age gap).

---

## 1. Design philosophy (read this first)

Everything below follows from four evidence-based principles. If you change the
system, keep these intact.

### 1.1 Don't bribe — the overjustification effect
Predictable, tangible, per-task rewards (especially **money**) *reduce*
intrinsic motivation over time (Lepper, Deci & Ryan). Once "I do math" becomes
"I do math for $5", interest collapses the moment the reward feels routine or
stops — often to a level *lower* than if you'd never paid.

**Consequence in this app:** there is **no money and no per-task payout**.
Real-world rewards exist, but they're rare, surprising, and **experiential /
relational** (movie pick, stay-up-late, one-on-one time, hugs). Relational
rewards reinforce connection rather than commodifying learning, so they don't
trigger the overjustification effect the way cash does.

### 1.2 Feed competence, autonomy, relatedness (Self-Determination Theory)
Durable motivation comes from feeling capable, in control, and connected.
- **Competence** → mastery badges + visible progress bars ("you're getting better").
- **Autonomy** → the child picks topic and difficulty (already in the core app).
- **Relatedness** → experiential rewards redeemed *with family*, and
  **cooperative family goals** the sisters complete together.

### 1.3 Reward effort & bravery, not just perfect scores (growth mindset)
If you only reward 100%s, kids avoid hard topics to protect their record (Dweck's
fixed-mindset trap). So badges reward **trying Hard mode, coming back after a bad
day, and improving** — and **all badge copy is process-praise** ("You practised 7
days straight!"), never person-praise ("You're so smart!").

### 1.4 Use variable reinforcement — ethically
Unpredictable rewards are far more engaging and extinction-resistant than fixed
ones (the slot-machine effect). We use it, but safely:
- **Effort always pays** — every finished quiz yields a collectible (guaranteed
  progress, no "bad luck" frustration).
- The randomness lives only in the **bonus** (which collectible, what rarity),
  never in *whether* effort was rewarded.

### 1.5 Sibling dynamic: cooperate, don't compete
A leaderboard between a 2nd-grader and a 5th-grader is unfair and demotivating
for the youngest. So there is **no cross-sibling competition**. Each girl has her
own progress, plus **shared family goals** that pull them together.

---

## 2. The system at a glance

There are **two engagement surfaces** and **three reward layers**.

| Surface | What it is | Where |
|---|---|---|
| **Streak calendar** | Apple-Fitness-style 4-week ring grid on the home hub | `components/StreakCalendar.tsx`, `api/streak` |
| **Trophy Room** | Badge wall, collection album, tickets, family goals | `app/trophies/page.tsx`, `api/rewards` |

| Layer | Purpose | Cadence |
|---|---|---|
| **1. Mastery badges** | Competence + direction; reward effort/bravery | Predictable, earned by hitting criteria |
| **2. Collectibles** | Delight + anti-boredom; a set to complete | Variable rarity, one drop per finished quiz |
| **3. Golden Tickets** | Big excitement spikes; real-world magic | Rare; experiential rewards only |
| **+ Family goals** | Relatedness; cooperative, age-fair | Pooled across all three sisters |

---

## 3. The streak calendar

**Files:** `src/components/StreakCalendar.tsx`, `src/app/api/streak/route.ts`.

A 28-day (4-week) grid, columns Mon–Sun, ending on the current week — modelled on
Apple Fitness. Each active day shows **two concentric rings**:

- **Red (outer) = time** — closes when the child hits the **daily goal of 30
  minutes** (`DAILY_GOAL_SECONDS = 30 * 60` in `api/streak/route.ts`).
- **Yellow (inner) = correctness** — that day's correct ÷ total answers.

**Why two rings:** time-on-task and accuracy are different behaviours. Rewarding
*only* accuracy punishes kids for attempting hard things; rewarding *only* time
rewards idling. Showing both, Apple-style, makes "close both rings" the daily
ritual.

**Data:** `api/streak` aggregates `quiz_results` by day
(`SUM(total_time_seconds)`, `SUM(score)`, `SUM(total_questions)`) over the last
40 days. No new table — it's derived. Degrades to empty rings when there's no DB
(local dev).

It lives in the page header (`app/page.tsx`), to the right of the `galia/math`
branding, on the indigo bar.

**Streak counting (`computeStreaks`)** — drives the streak *badges* and the
profile "N-day streak" number. It is **weekend-forgiving with make-up**:
practice is expected on weekdays, weekends are free, and the run only breaks on
a **missed weekday that isn't made up**. Each weekend session that week earns
one make-up credit that forgives one missed weekday — so a kid who misses a
Wednesday can catch up on Saturday and keep her streak. A perfect weekday
attendance therefore yields a continuous streak across the whole period (e.g. a
2-month weekday run = a 62-day streak). Reported in calendar days.

---

## 4. Reward definitions & logic (the heart)

**File:** `src/lib/rewards.ts` — **isomorphic** (no server-only imports) so both
the award engine and the client (popup, trophy room) can use it. All reward
*definitions* live in code; the DB only stores *earned state*.

### 4.1 Rarity
```
common 62%  ·  rare 28%  ·  epic 8.5%  ·  legendary 1.5%
```
`RARITY_META` holds the weights + display colors. Rarity drives drop odds, card
styling, and the "LEGENDARY!" popup headline.

### 4.2 Layer 1 — Mastery badges (`BADGES`, 18 of them)
Each badge has an `id`, process-praise `description`, `icon`, `rarity`, a
`check(stats)` predicate, and an optional `progress(stats)` for the locked-state
progress bar. Categories:

- **Volume / effort:** First Steps, Getting Serious (10 quizzes), Century (100
  problems), Number Cruncher (500), Math Machine (1000).
- **Excellence:** Flawless (1 perfect), Perfectionist (10), Sharp Shooter (25),
  Accuracy Ace (90%+ over 200 problems).
- **Consistency (ties to the streak):** On a Roll (3 days), Week Warrior (7),
  Two-Week Titan (14), Unstoppable (30).
- **Growth mindset:** **Comeback Kid** (aced a retry round), **Daredevil** (did a
  Hard quiz), **Brave Heart** (10 Hard quizzes).
- **Breadth:** Topic Tamer (3 topics mastered), Topic Master (5).

`evaluateBadges(stats)` returns all satisfied badge ids; the engine awards the
ones not already earned.

### 4.3 Layer 2 — Collectibles ("Action Figures 2026", `COLLECTIBLES`, 25 items)
Personalized **action-figure cards** — one per theme (Explorer, Astronaut,
Ballet Star, …), each rendered with **the girl's own face** (Nano Banana art in
`/public/collectibles/<girl>_<theme>.png`; see §8). Rarity split: 10 common, 8
rare, 5 epic, 2 legendary (astronaut, dreamer). Each `CollectibleDef` keeps an
emoji `icon` as a fallback; the per-girl image path comes from
`collectibleImage(girl, id)`.

- **Every finished quiz yields exactly one drop** (effort always pays).
- `rollRarity(accuracy)` weights the roll by the *session's* accuracy: finishing
  guarantees a drop, but **higher accuracy nudges luck toward rarer critters**
  (skill is rewarded without punishing effort). `rollCollectible` then picks a
  random item of that rarity.
- Duplicates increment a `count`; the album shows `×N`.
- **Why a set with visible empty slots:** the "gotta complete the collection"
  pull (Pokémon/sticker-album mechanic) is a strong, *intrinsic-ish* driver —
  far more durable than a points counter.

### 4.4 Layer 3 — Golden Tickets (`TICKETS`, 8, **experiential only**)
Movie Night Pick, Stay Up Late, Special Time (1-on-1), Bake Together, Giant Hug,
Dinner Chooser, Game Night Pick, Ice Cream Trip.

- **No money** — by design (§1.1). These are deliberately rare so they stay
  magical.
- **How they're won (`award.ts`):**
  - `TICKET_PERFECT_CHANCE = 0.12` — a 12% roll on a **perfect score**.
  - **Guaranteed** when the quiz earns a **new legendary badge**.
- When won, the engine **emails the parent** (via Resend) so they know to honor
  it IRL.

### 4.5 Cooperative family goals (`FAMILY_GOALS`, 3)
Computed across **all** users, recorded once when completed (so they don't
re-fire):
- **Badge Brigade** — 50 badges family-wide → 🍕 Pizza Night.
- **Critter Crew** — 60 critters family-wide → 🎢 Family Day Out.
- **All Together Now** — every sister hits a 7-day streak → 🎬 Movie Marathon.

### 4.6 Streak helper
`computeStreaks(dates, today)` returns `{ current, best }` from the set of active
dates. Reused for both badge consistency checks and the family week-streak goal.

---

## 5. Award engine (server)

**File:** `src/lib/award.ts` (server-only — imports `@vercel/postgres`, `resend`).
Entry point: `awardRewards({ userId, userName, sessionScore, sessionTotal })`.

Sequence (all wrapped so a failure **never** blocks result submission):
1. `ensureTables()` — idempotent `CREATE TABLE IF NOT EXISTS` so prod needs no
   manual migration.
2. `computeStats(userId)` — aggregate `quiz_results` into a `UserStats`
   (sessions, problems, correct, perfect scores, hard completed, comebacks,
   topics mastered, current/best streak).
3. **Badges:** diff satisfied vs already-earned, insert new ones.
4. **Collectible:** roll one using *this session's* accuracy, upsert with
   duplicate count.
5. **Tickets:** perfect-score chance + guaranteed-on-legendary.
6. **Family goals:** compute pooled metrics, record newly-completed ones.
7. **Notify parent** (email) for any tickets / family goals.
8. Return `EarnedRewards` so the client can celebrate.

`computeStats` and `getFamilyMetrics` are also exported for the read API.

---

## 6. Data model

Reward **definitions are code**; these tables hold **earned state** only.
(`schema.sql`, and `ensureTables()` mirrors them for auto-provisioning.)

| Table | Holds | Key |
|---|---|---|
| `user_badges` | earned badges | `UNIQUE(user_id, badge_id)` |
| `user_collectibles` | owned critters + duplicate `count` | `UNIQUE(user_id, collectible_id)` |
| `user_tickets` | won tickets + `status` (unredeemed/redeemed) | per row |
| `family_milestones` | completed family goals (once) | `UNIQUE(goal_id)` |

All streak/stat numbers are **derived from the existing `quiz_results` table** —
no duplication of source-of-truth data.

---

## 7. End-to-end flow & UI

```
Quiz finishes
  → POST /api/results
      → saves quiz_results row
      → awardRewards()  → persists badges/collectibles/tickets/family goals
                        → emails parent on real-world wins
      → returns { success, rewards }
  → quiz page stashes rewards in sessionStorage("quizRewards")
  → navigates to /results
      → RewardPopup celebrates (confetti + liquid-glass card)
Home hub  → 👤 Profile button → /profile?user=ID
      → GET /api/rewards  → action-figure collection (owned art vs ❓ locked),
                            badge wall (earned + locked w/ progress),
                            tickets (with Redeem toggle), family-goal bars
      → POST /api/rewards/redeem  → mark a ticket redeemed
```

**Files:** `app/api/results/route.ts`, `app/quiz/page.tsx`,
`app/results/page.tsx`, `components/RewardPopup.tsx`, `app/profile/page.tsx`,
`app/api/rewards/route.ts`, `app/api/rewards/redeem/route.ts`,
confetti keyframes in `app/globals.css`.

**Why a one-shot popup + a persistent room:** the popup delivers the *dopamine
spike* at the moment of achievement; the Trophy Room provides the *collection to
return to* and the *goals to aim at* (the empty slots and progress bars are the
pull back in).

---

## 8. Collectible artwork pipeline (planned/in-progress)

The emoji critters are a placeholder. The richer plan: **action-figure-in-blister-packaging**
images, one per theme, with each girl's **face from her reference photo**
(`agents/collectible-designer/{iris,zoe,rose}.png`; style template in that dir's
`SKILL.md`). Themes: explorer, astronaut, swimmer, vet, firefighter, ballet,
gymnast, etc.

- **Model:** Nano Banana = **`gemini-2.5-flash-image`**, image-to-image with the
  face as reference.
- **Access:** the **pay** MCP (`$0.01`/image), endpoint
  `…/v1beta/models/gemini-2.5-flash-image:generateContent`.
- **Tooling note:** this required two fixes in `~/Coding/pay` (a `body_file`
  param on the `curl` tool for large base64 bodies, and an OpenAPI path-matching
  fix for Google custom-verb URLs). See the `pay-bodyfile-nanobanana` memory.

---

## 9. Tuning knobs — `reward-rules.json` (no code change)

Most engine behaviour is driven by **`reward-rules.json`** at the app root,
loaded via `src/lib/reward-rules.ts` (merged over `DEFAULT_RULES`, so partial
files are safe). Edit and `next dev` hot-reloads; redeploy to apply in prod.

| Key | Effect |
|---|---|
| `dailyGoalSeconds` | Red streak-ring goal (default 1800 = 30 min) |
| `collectible.enabled` | Master switch for drops |
| `collectible.sessionCooldown` | Sessions to wait between drops. `0` = every session; `1` = no two in a row; … |
| `collectible.minAccuracy` | Min session accuracy (0–1) to be drop-eligible |
| `collectible.rarityWeights` / `accuracyBoost` | Drop odds + how accuracy skews them |
| `tickets.perfectScoreChance` | Ticket chance on a perfect score |
| `tickets.guaranteedOnLegendaryBadge` | Always grant on a legendary badge |
| `tickets.dailyCap` | Max tickets per child per day |
| `badges.enabled` / `tickets.enabled` | Master switches |
| `collectible.mode` | `"points"` (effort points → figures) or `"perSession"` |
| `collectible.levelPoints` | Points + result threshold per level (hard/medium/easy) |
| `collectible.pointsPerCollectible` | Points to unlock one figure |
| `redemption.dollarsPerPoint` | End-of-summer cash value per point ($0.76 ≈ $200 for a perfect-hard summer) |

**First-round gating:** loot (points → collectibles, tickets) is granted on
**round 1 only**, using that round's result — retries can't farm rewards. Badges
evaluate every round (cumulative; Comeback Kid needs a retry). Points are a
**cumulative score** stored in `user_points` (never spent): figures unlock at
each `pointsPerCollectible` milestone, and the running total cashes out at
summer's end (profile shows a 💰 chip; `RewardPopup` celebrates `+points`).

**Badge definitions** live in editable **`badges.json`** at the app root (id,
name, description, icon, rarity, + declarative `criteria`). `rewards.ts` loads
it and builds the check/progress logic. Criteria are `{ "stat": <name>, "gte":
<n> }` or `{ "all": [ … ] }`; available stats: `sessions, totalProblems,
totalCorrect, perfectScores, hardCompleted, comebacks, topicsMastered,
currentStreak, bestStreak, accuracy`. The locked-badge progress bar tracks the
first count-based criterion.

Still in code: collectible/ticket/family-goal **definitions** (arrays in
`rewards.ts`) and per-child tuning (branch on `userId` in `award.ts`).

The cooldown is enforced in `award.ts` via `sessionsSinceLastCollectible()`
(counts `quiz_results` since the last `user_collectibles.last_earned_at`).

**Per-child guidance:** younger kids need denser reinforcement. A reasonable
future tweak is to raise drop rarity odds or lower badge thresholds for Rose
(grade 2) while keeping Zoe's (grade 5) rarer — without ever making it a
*competition* between them.

---

## 10. Local development (DB + seed)

Production uses `@vercel/postgres` (Neon protocol). Locally that driver can't
talk to a plain Postgres, so `src/lib/db.ts` swaps in the standard `pg` driver
when `DB_DRIVER=pg` is set. All routes import `sql` from `@/lib/db`, not
`@vercel/postgres`.

Setup (already done on this machine):
1. `.env.local` (gitignored): `POSTGRES_URL=postgres://localhost:5432/galia` and `DB_DRIVER=pg`.
2. Create the `galia` DB and run `schema.sql`.
3. Seed realistic, differentiated data for the three girls:
   `node scripts/seed.mjs` (deterministic; wipes + repopulates quiz_results and
   all reward tables with internally-consistent badges/collectibles/tickets).

Note: `schema.sql` was updated to include the `round / level / is_test_mode /
session_id` columns on `quiz_results` (production had them via earlier ALTERs;
the file had drifted).

## 11. Simulating & testing behaviour

`src/lib/reward-engine.ts` is a **pure, DB-free** version of the reward decision
logic — same definitions (`rewards.ts`) and rules (`reward-rules.json`) as
production `award.ts`, but it threads all state explicitly so seasons of play
can be replayed deterministically (seeded RNG). Family goals are cross-user and
stay in `award.ts`; the engine is single-player.

- **Unit tests:** `pnpm test` (`src/lib/reward-engine.test.ts`) — badge
  thresholds, streaks, comeback, collectible cooldown / min-accuracy /
  determinism, ticket daily-cap, and a 6-week summer shape check.
- **Scenario CLI:** `pnpm simulate <scenario.json> [--json]` prints a day-by-day
  timeline of what's won (and the structured per-day array with `--json`).
  Scenario shape:
  ```json
  [{ "date": "01/07/2026", "theme": "additions", "level": "hard", "result": 80.5 }]
  ```
  `result` is a percentage; `date` accepts `YYYY-MM-DD` or `DD/MM/YYYY`.
  `pnpm simulate` with no file runs three built-in summer personas (diligent /
  sporadic / perfectionist) — a quick way to feel how the knobs in
  `reward-rules.json` play out over a whole summer.

## 12. Guardrails — please preserve

- **No money / no per-task payouts.** Real rewards stay rare + experiential.
- **No sibling leaderboard.** Cooperative goals only.
- **Effort always pays** (guaranteed collectible per finished quiz); randomness
  only in the bonus.
- **Process-praise copy**, and badges that reward bravery/persistence, not just
  perfect scores.
- Reward evaluation must stay **best-effort** — never block result submission.
