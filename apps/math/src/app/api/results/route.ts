import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { Resend } from "resend";
import { Mistake } from "@/lib/types";
import { awardRewards, type EarnedRewards } from "@/lib/award";

interface ThemeBreakdown {
  theme: string;
  correct: number;
  total: number;
}

interface ResultPayload {
  userId: string;
  userName: string;
  themeId: string;
  themeName: string;
  score: number;
  totalQuestions: number;
  totalTimeSeconds: number;
  avgTimePerQuestion: number;
  mistakes: Mistake[];
  allAnswers: {
    questionId: number;
    question: string;
    userAnswer: number | null;
    correctAnswer: number;
    timeSpent: number;
  }[];
  round?: number;
  level?: string;
  isTestMode?: boolean;
  themeBreakdown?: ThemeBreakdown[];
  sessionId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ResultPayload = await request.json();

    // Save to database (only if DATABASE_URL is configured)
    if (process.env.POSTGRES_URL) {
      try {
        await sql`
          INSERT INTO quiz_results (
            user_id, user_name, theme_id, theme_name,
            score, total_questions, total_time_seconds, avg_time_per_question,
            mistakes, all_answers, round, level, is_test_mode, session_id, completed_at
          ) VALUES (
            ${body.userId}, ${body.userName}, ${body.themeId}, ${body.themeName},
            ${body.score}, ${body.totalQuestions}, ${body.totalTimeSeconds}, ${body.avgTimePerQuestion},
            ${JSON.stringify(body.mistakes)}, ${JSON.stringify(body.allAnswers)},
            ${body.round || 1}, ${body.level || "easy"}, ${body.isTestMode || false},
            ${body.sessionId || null}, NOW()
          )
        `;
      } catch (dbError) {
        console.error("Database error (continuing without save):", dbError);
      }
    }

    // Send email notification
    const notificationEmail = process.env.NOTIFICATION_EMAIL;
    if (notificationEmail && process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const successRate = ((body.score / body.totalQuestions) * 100).toFixed(1);
      const avgTime = body.avgTimePerQuestion.toFixed(1);
      const totalMinutes = Math.floor(body.totalTimeSeconds / 60);
      const totalSeconds = body.totalTimeSeconds % 60;

      const mistakesList = body.mistakes
        .map(
          (m) =>
            `• Q${m.questionNumber}: ${m.question}\n  Answer: ${m.userAnswer || "Skipped"}\n  Correct: ${m.correctAnswer}\n  Hint: ${m.hint}`,
        )
        .join("\n\n");

      // Format level for display (capitalize first letter)
      const levelDisplay = body.level
        ? body.level.charAt(0).toUpperCase() + body.level.slice(1)
        : "Unknown";

      // Format theme breakdown for test mode
      const themeBreakdownText = body.themeBreakdown
        ? body.themeBreakdown
            .sort((a, b) => b.correct / b.total - a.correct / a.total)
            .map((t) => {
              const pct = ((t.correct / t.total) * 100).toFixed(0);
              return `• ${t.theme}: ${t.correct}/${t.total} (${pct}%)`;
            })
            .join("\n")
        : "";

      // Mode label for subject and body
      const modeLabel = body.isTestMode ? "Test" : "Training";

      try {
        // Only send attempt email if not a perfect score
        // Perfect scores get a special success email instead
        const isPerfectScore = body.score === body.totalQuestions;

        if (!isPerfectScore) {
          // Regular attempt email (with mistakes)
          await resend.emails.send({
            from: "Galia <onboarding@resend.dev>",
            to: notificationEmail,
            subject: `[galia/math] ${body.userName} completed ${body.themeName} (${levelDisplay} ${modeLabel}) - ${successRate}%`,
            text: `
Quiz Results for ${body.userName}
================================

Mode: ${modeLabel}
Level: ${levelDisplay}
Theme: ${body.themeName}
Score: ${body.score}/${body.totalQuestions} (${successRate}%)
Round: ${body.round || 1}
Total Time: ${totalMinutes}m ${totalSeconds}s
Average Time per Question: ${avgTime}s
${
  body.isTestMode && themeBreakdownText
    ? `
Performance by Theme:
${themeBreakdownText}
`
    : ""
}
Mistakes (${body.mistakes.length}):

${mistakesList}

---
Galamath Quiz App
            `.trim(),
          });
        } else {
          // Success email - perfect score achieved!
          const round = body.round || 1;
          await resend.emails.send({
            from: "Galia <onboarding@resend.dev>",
            to: notificationEmail,
            subject: `[galia/math] ${body.userName} achieved PERFECT SCORE on ${body.themeName} (${levelDisplay} ${modeLabel})!`,
            text: `
PERFECT SCORE!
================================

${body.userName} has successfully completed ${body.themeName} with a perfect score!

Mode: ${modeLabel}
Level: ${levelDisplay}
Score: ${body.score}/${body.totalQuestions} (100%)
Rounds needed: ${round}
Total Time: ${totalMinutes}m ${totalSeconds}s
Average Time per Question: ${avgTime}s
${
  body.isTestMode && themeBreakdownText
    ? `
Performance by Theme:
${themeBreakdownText}
`
    : ""
}
${round === 1 ? "Amazing! First try success!" : `Completed after ${round} rounds of practice.`}

---
Galamath Quiz App
            `.trim(),
          });
        }
      } catch (emailError) {
        console.error("Email error (continuing):", emailError);
      }
    }

    // Evaluate and persist rewards (badges, collectibles, tickets, family
    // goals). Best-effort: never blocks the result submission.
    let rewards: EarnedRewards = {
      badges: [],
      collectible: null,
      tickets: [],
      familyGoals: [],
      pointsEarned: 0,
    };
    try {
      rewards = await awardRewards({
        userId: body.userId,
        userName: body.userName,
        sessionScore: body.score,
        sessionTotal: body.totalQuestions,
        level: body.level,
        round: body.round,
      });
    } catch (rewardError) {
      console.error("Reward error (continuing):", rewardError);
    }

    return NextResponse.json({ success: true, rewards });
  } catch (error) {
    console.error("Error processing result:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process result" },
      { status: 500 },
    );
  }
}
