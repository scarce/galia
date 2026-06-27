import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { RULES } from "@/lib/reward-rules";

// Daily aggregated activity used to draw the Apple-Fitness-style rings.
export interface StreakDay {
  date: string; // YYYY-MM-DD (UTC)
  timeSeconds: number; // total time spent practising that day
  correct: number; // total correct answers that day
  total: number; // total questions answered that day
}

// Daily goal for the red ring (configurable in reward-rules.json).
export const DAILY_GOAL_SECONDS = RULES.dailyGoalSeconds;

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user");

  if (!userId) {
    return NextResponse.json({ error: "Missing user" }, { status: 400 });
  }

  // Gracefully degrade when no DB is configured (e.g. local dev) so the
  // calendar still renders as an empty (but inviting) set of rings.
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ days: [], goalSeconds: DAILY_GOAL_SECONDS });
  }

  try {
    const result = await sql`
      SELECT
        to_char(completed_at, 'YYYY-MM-DD') AS date,
        SUM(total_time_seconds)::int AS time_seconds,
        SUM(score)::int AS correct,
        SUM(total_questions)::int AS total
      FROM quiz_results
      WHERE user_id = ${userId}
        AND completed_at >= NOW() - INTERVAL '40 days'
      GROUP BY to_char(completed_at, 'YYYY-MM-DD')
      ORDER BY date
    `;

    const days: StreakDay[] = result.rows.map((row) => ({
      date: row.date as string,
      timeSeconds: Number(row.time_seconds) || 0,
      correct: Number(row.correct) || 0,
      total: Number(row.total) || 0,
    }));

    return NextResponse.json({ days, goalSeconds: DAILY_GOAL_SECONDS });
  } catch (error) {
    console.error("Streak query error:", error);
    return NextResponse.json({ days: [], goalSeconds: DAILY_GOAL_SECONDS });
  }
}
