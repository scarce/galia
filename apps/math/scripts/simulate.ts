// Reward-engine simulator CLI.
//
//   pnpm simulate <scenario.json>     # run a scenario file, print the timeline
//   pnpm simulate <scenario.json> --json   # also dump structured JSON output
//   pnpm simulate                     # run the built-in summer personas
//
// Scenario JSON is an array of sessions in the user-facing shape:
//   [{ "date": "01/07/2026", "theme": "additions", "level": "hard", "result": 80.5 }, ...]
// `result` is a percentage (0–100). `date` accepts YYYY-MM-DD or DD/MM/YYYY.

import { readFileSync } from "node:fs";
import {
  simulate,
  type EngineSession,
  type SimulationResult,
} from "../src/lib/reward-engine";

const TOTAL_QUESTIONS = 40; // quiz size the app uses

interface InputSession {
  date: string;
  theme: string;
  level: string;
  result: number; // percentage 0–100
  round?: number;
  test?: boolean;
}

// Normalize "YYYY-MM-DD" or "DD/MM/YYYY" (European) → "YYYY-MM-DD".
function normDate(d: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return d;
}

function toEngine(input: InputSession[]): EngineSession[] {
  return input
    .map((s) => ({
      date: normDate(s.date),
      themeId: s.theme,
      level: s.level,
      score: Math.round((s.result / 100) * TOTAL_QUESTIONS),
      totalQuestions: TOTAL_QUESTIONS,
      round: s.round,
      isTest: s.test,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function printTimeline(label: string, r: SimulationResult) {
  console.log(`\n=== ${label} ===`);
  for (const day of r.days) {
    const parts: string[] = [];
    for (const b of day.badges) parts.push(`🏅 ${b.icon} ${b.name}`);
    for (const c of day.collectibles)
      parts.push(`🧸 ${c.icon} ${c.figureGirl}'s ${c.name} (${c.rarity})`);
    for (const t of day.tickets) parts.push(`🎫 ${t.icon} ${t.name}`);
    if (parts.length)
      console.log(
        `${day.date}  ${parts.join("   ")}   ·  $${day.dollars.toFixed(2)}`,
      );
  }
  const s = r.finalStats;
  const totalDrops = r.days.reduce((a, d) => a + d.collectibles.length, 0);
  const totalTickets = r.days.reduce((a, d) => a + d.tickets.length, 0);
  console.log(
    `— summary: ${s.sessions} sessions · ${s.totalProblems} problems · ` +
      `${s.perfectScores} perfects · streak ${s.currentStreak}/${s.bestStreak} · ` +
      `${r.state.earnedBadgeIds.size} badges · ${totalDrops} collectibles · ${totalTickets} tickets`,
  );
  console.log(
    `— end-of-summer: ${r.totalPoints} points → 💰 $${r.dollars.toFixed(2)}`,
  );
}

// Structured output in the shape the user asked for.
function structured(r: SimulationResult) {
  return r.days.map((d) => ({
    date: d.date,
    collectibles: d.collectibles.map((c) => ({
      id: c.id,
      name: c.name,
      figureGirl: c.figureGirl,
      rarity: c.rarity,
    })),
    badges: d.badges.map((b) => ({ id: b.id, name: b.name, rarity: b.rarity })),
    tickets: d.tickets.map((t) => ({ id: t.id, name: t.name })),
  }));
}

// ── built-in summer personas (Jul–Aug 2026) ──────────────────────────────
function summerPersonas(): { label: string; sessions: EngineSession[] }[] {
  const start = Date.UTC(2026, 6, 1);
  const day = (i: number) =>
    new Date(start + i * 86400000).toISOString().slice(0, 10);
  const THEMES = ["addition", "subtraction", "geometry", "algebra", "word-problems"];
  const mk = (
    i: number,
    result: number,
    level = "easy",
    round?: number,
  ): EngineSession => ({
    date: day(i),
    themeId: THEMES[i % THEMES.length],
    level,
    score: Math.round((result / 100) * TOTAL_QUESTIONS),
    totalQuestions: TOTAL_QUESTIONS,
    round,
  });

  const diligent: EngineSession[] = [];
  for (let i = 0; i < 56; i++) {
    if (i % 7 >= 5) continue; // weekdays only... actually skip weekends
    diligent.push(mk(i, 78 + (i % 18), i % 6 === 0 ? "hard" : "easy"));
    if (i % 9 === 0) diligent.push(mk(i, 100, "medium")); // a second, perfect session
  }

  const sporadic: EngineSession[] = [];
  for (let i = 0; i < 56; i += 1) {
    if (i % 3 !== 0) continue; // every ~3rd day
    sporadic.push(mk(i, 60 + (i % 25)));
  }

  const perfectionist: EngineSession[] = [];
  for (let i = 0; i < 56; i++) {
    if (i % 7 === 3) continue; // one rest day a week
    perfectionist.push(mk(i, i % 4 === 0 ? 100 : 92, "medium"));
  }

  return [
    { label: "Diligent (≈5 days/week, improving, some Hard)", sessions: diligent },
    { label: "Sporadic (every ~3rd day)", sessions: sporadic },
    { label: "Perfectionist (near-daily, high accuracy)", sessions: perfectionist },
  ];
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const asJson = args.includes("--json");

  if (file) {
    const input = JSON.parse(readFileSync(file, "utf8")) as InputSession[];
    const r = simulate(toEngine(input), { seed: 1 });
    printTimeline(file, r);
    if (asJson) console.log("\n" + JSON.stringify(structured(r), null, 2));
    return;
  }

  console.log("No scenario file given — running built-in summer personas.\n");
  for (const p of summerPersonas()) {
    const r = simulate(p.sessions, { seed: 1 });
    printTimeline(p.label, r);
  }
}

main();
