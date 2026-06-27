import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 500 }
    );
  }

  try {
    // Get all users
    const users = await sql`
      SELECT DISTINCT user_id, user_name FROM quiz_results ORDER BY user_name
    `;

    // Get summary stats per user
    const summaryStats = await sql`
      SELECT
        user_id,
        user_name,
        COUNT(*) as total_quizzes,
        SUM(total_questions) as total_questions,
        ROUND(AVG(avg_time_per_question)::numeric, 1) as avg_time_per_question
      FROM quiz_results
      WHERE is_test_mode = false
      GROUP BY user_id, user_name
    `;

    // Get all quiz data for correction rate calculation
    // Include both sessions with and without session_id (for historical data)
    const allQuizData = await sql`
      SELECT
        user_id,
        user_name,
        session_id,
        theme_name,
        level,
        round,
        all_answers,
        completed_at
      FROM quiz_results
      WHERE is_test_mode = false
      ORDER BY user_id, theme_name, level, completed_at
    `;

    // Calculate correction rate per session
    // Correction rate = mistakes fixed in round N+1 / mistakes from round N
    interface SessionRound {
      round: number;
      answers: Map<string, { correct: boolean; userAnswer: number | null }>;
      completedAt: Date;
    }

    const sessionRounds: Record<string, {
      user_name: string;
      theme_name: string;
      level: string;
      completed_at: string;
      rounds: SessionRound[];
    }> = {};

    // For data without session_id, infer sessions by grouping consecutive rounds
    // within 30 minutes of each other
    const inferredSessions: Record<string, {
      user_name: string;
      theme_name: string;
      level: string;
      completed_at: string;
      rounds: SessionRound[];
    }> = {};

    let inferredSessionCounter = 0;

    // First pass: group rows with session_id by session_id
    // This handles cases where level might be incorrectly saved
    for (const row of allQuizData.rows) {
      if (row.session_id) {
        const completedAt = new Date(row.completed_at);
        const answersMap = new Map<string, { correct: boolean; userAnswer: number | null }>();
        const allAnswers = row.all_answers as Array<{
          question: string;
          userAnswer: number | null;
          correctAnswer: number;
        }> || [];

        for (const ans of allAnswers) {
          answersMap.set(ans.question, {
            correct: ans.userAnswer === ans.correctAnswer,
            userAnswer: ans.userAnswer,
          });
        }

        const roundData: SessionRound = {
          round: row.round,
          answers: answersMap,
          completedAt,
        };

        if (!sessionRounds[row.session_id]) {
          sessionRounds[row.session_id] = {
            user_name: row.user_name,
            theme_name: row.theme_name,
            level: row.level,
            completed_at: row.completed_at,
            rounds: [],
          };
        }
        // Use level from round 1 (first round determines the level)
        if (row.round === 1) {
          sessionRounds[row.session_id].level = row.level;
        }
        sessionRounds[row.session_id].completed_at = row.completed_at;
        sessionRounds[row.session_id].rounds.push(roundData);
      }
    }

    // Second pass: handle rows without session_id - group by user/theme/level and infer sessions
    const groupedDataWithoutSession: Record<string, typeof allQuizData.rows> = {};
    for (const row of allQuizData.rows) {
      if (!row.session_id) {
        const key = `${row.user_id}|${row.theme_name}|${row.level}`;
        if (!groupedDataWithoutSession[key]) groupedDataWithoutSession[key] = [];
        groupedDataWithoutSession[key].push(row);
      }
    }

    // Process each group - infer sessions based on timing
    for (const [key, rows] of Object.entries(groupedDataWithoutSession)) {
      rows.sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime());

      let currentInferredSessionId: string | null = null;
      let lastCompletedAt: Date | null = null;

      for (const row of rows) {
        const completedAt = new Date(row.completed_at);
        const answersMap = new Map<string, { correct: boolean; userAnswer: number | null }>();
        const allAnswers = row.all_answers as Array<{
          question: string;
          userAnswer: number | null;
          correctAnswer: number;
        }> || [];

        for (const ans of allAnswers) {
          answersMap.set(ans.question, {
            correct: ans.userAnswer === ans.correctAnswer,
            userAnswer: ans.userAnswer,
          });
        }

        const roundData: SessionRound = {
          round: row.round,
          answers: answersMap,
          completedAt,
        };

        // More than 30 min since last quiz = new session
        const timeSinceLast = lastCompletedAt
          ? (completedAt.getTime() - lastCompletedAt.getTime())
          : Infinity;
        const isNewSession = timeSinceLast > 30 * 60 * 1000;

        if (isNewSession || !currentInferredSessionId) {
          inferredSessionCounter++;
          currentInferredSessionId = `inferred-${inferredSessionCounter}`;
          inferredSessions[currentInferredSessionId] = {
            user_name: row.user_name,
            theme_name: row.theme_name,
            level: row.level,
            completed_at: row.completed_at,
            rounds: [],
          };
        }

        inferredSessions[currentInferredSessionId].completed_at = row.completed_at;
        inferredSessions[currentInferredSessionId].rounds.push(roundData);
        lastCompletedAt = completedAt;
      }
    }

    // Merge both session sources
    const allSessions = { ...sessionRounds, ...inferredSessions };

    // Calculate focus scores based on correction rates
    interface FocusData {
      user_name: string;
      theme_name: string;
      level: string;
      total_multi_round_sessions: number;
      total_mistakes: number;
      total_corrections: number;
      correction_rate: number;
      mastery_count: number; // sessions that reached 100%
      last_attempt: string;
    }

    const focusDataMap: Record<string, FocusData> = {};

    for (const [sessionId, session] of Object.entries(allSessions)) {
      const key = `${session.user_name}|${session.theme_name}|${session.level}`;

      if (!focusDataMap[key]) {
        focusDataMap[key] = {
          user_name: session.user_name,
          theme_name: session.theme_name,
          level: session.level,
          total_multi_round_sessions: 0,
          total_mistakes: 0,
          total_corrections: 0,
          correction_rate: 0,
          mastery_count: 0,
          last_attempt: session.completed_at,
        };
      }

      // Update last attempt if more recent
      if (new Date(session.completed_at) > new Date(focusDataMap[key].last_attempt)) {
        focusDataMap[key].last_attempt = session.completed_at;
      }

      // Need at least 2 rounds to calculate correction rate
      if (session.rounds.length < 2) continue;

      focusDataMap[key].total_multi_round_sessions++;

      // Sort rounds by completion time (more reliable than round number for old data)
      session.rounds.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

      // Check if final round achieved 100%
      const finalRound = session.rounds[session.rounds.length - 1];
      let allCorrect = true;
      finalRound.answers.forEach((ans) => {
        if (!ans.correct) allCorrect = false;
      });
      if (allCorrect && finalRound.answers.size > 0) {
        focusDataMap[key].mastery_count++;
      }

      // Calculate corrections between consecutive rounds
      for (let i = 0; i < session.rounds.length - 1; i++) {
        const currentRound = session.rounds[i];
        const nextRound = session.rounds[i + 1];

        // Find mistakes in current round
        const mistakes: string[] = [];
        currentRound.answers.forEach((ans, question) => {
          if (!ans.correct) {
            mistakes.push(question);
          }
        });

        // Count how many were corrected in next round
        let corrections = 0;
        for (const question of mistakes) {
          const nextAnswer = nextRound.answers.get(question);
          if (nextAnswer && nextAnswer.correct) {
            corrections++;
          }
        }

        focusDataMap[key].total_mistakes += mistakes.length;
        focusDataMap[key].total_corrections += corrections;
      }
    }

    // Calculate final correction rates
    const seriousnessStats = Object.values(focusDataMap).map(data => ({
      ...data,
      correction_rate: data.total_mistakes > 0
        ? Math.round((data.total_corrections / data.total_mistakes) * 100)
        : 0,
    }));

    // Calculate per-session learning rates for charting
    const learningRateProgress: Array<{
      user_name: string;
      theme_name: string;
      level: string;
      session_id: string;
      completed_at: string;
      correction_rate: number;
      mistakes: number;
      corrections: number;
    }> = [];

    for (const [sessionId, session] of Object.entries(allSessions)) {
      // Need at least 2 rounds to calculate correction rate
      if (session.rounds.length < 2) continue;

      session.rounds.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

      let totalMistakes = 0;
      let totalCorrections = 0;

      for (let i = 0; i < session.rounds.length - 1; i++) {
        const currentRound = session.rounds[i];
        const nextRound = session.rounds[i + 1];

        const mistakes: string[] = [];
        currentRound.answers.forEach((ans, question) => {
          if (!ans.correct) mistakes.push(question);
        });

        let corrections = 0;
        for (const question of mistakes) {
          const nextAnswer = nextRound.answers.get(question);
          if (nextAnswer && nextAnswer.correct) corrections++;
        }

        totalMistakes += mistakes.length;
        totalCorrections += corrections;
      }

      if (totalMistakes > 0) {
        learningRateProgress.push({
          user_name: session.user_name,
          theme_name: session.theme_name,
          level: session.level,
          session_id: sessionId,
          completed_at: session.completed_at,
          correction_rate: Math.round((totalCorrections / totalMistakes) * 100),
          mistakes: totalMistakes,
          corrections: totalCorrections,
        });
      }
    }

    // Also get single-round session counts per theme/level
    const singleRoundStats = await sql`
      SELECT
        user_id,
        user_name,
        theme_name,
        level,
        COUNT(*) as total_sessions,
        SUM(CASE WHEN score = total_questions THEN 1 ELSE 0 END) as perfect_sessions,
        MAX(completed_at) as last_attempt
      FROM quiz_results
      WHERE is_test_mode = false
      GROUP BY user_id, user_name, theme_name, level
    `;

    // Get round 1 progress over time by theme and level (for charts)
    // Each row is one round 1 attempt (not grouped by date)
    const round1Progress = await sql`
      SELECT
        user_id,
        user_name,
        theme_name,
        level,
        completed_at,
        ROUND((score::float / NULLIF(total_questions, 0) * 100)::numeric, 1) as percentage
      FROM quiz_results
      WHERE round = 1 AND is_test_mode = false
      ORDER BY user_name, theme_name, level, completed_at
    `;

    // Get round analysis for "seriousness" detection
    // Compare round 1 vs later rounds: time spent, accuracy improvement
    const roundAnalysis = await sql`
      SELECT
        user_id,
        user_name,
        session_id,
        theme_name,
        level,
        round,
        score,
        total_questions,
        ROUND((score::float / NULLIF(total_questions, 0) * 100)::numeric, 1) as percentage,
        avg_time_per_question,
        total_time_seconds,
        completed_at,
        all_answers
      FROM quiz_results
      WHERE is_test_mode = false AND session_id IS NOT NULL
      ORDER BY session_id, round
    `;

    // Process round analysis to detect seriousness patterns
    const sessionAnalysis: Record<string, {
      user_name: string;
      theme_name: string;
      level: string;
      completed_at: string;
      rounds: Array<{
        round: number;
        percentage: number;
        avgTimePerQuestion: number;
        totalTime: number;
        allAnswers: any[];
      }>;
    }> = {};

    for (const row of roundAnalysis.rows) {
      if (!row.session_id) continue;

      if (!sessionAnalysis[row.session_id]) {
        sessionAnalysis[row.session_id] = {
          user_name: row.user_name,
          theme_name: row.theme_name,
          level: row.level,
          completed_at: row.completed_at,
          rounds: [],
        };
      }
      // Update completed_at to the latest
      sessionAnalysis[row.session_id].completed_at = row.completed_at;

      sessionAnalysis[row.session_id].rounds.push({
        round: row.round,
        percentage: parseFloat(row.percentage) || 0,
        avgTimePerQuestion: parseFloat(row.avg_time_per_question) || 0,
        totalTime: row.total_time_seconds,
        allAnswers: row.all_answers || [],
      });
    }

    // Analyze sessions for seriousness
    // A "not serious" session shows:
    // - Very fast answer times in later rounds (< 5 seconds avg)
    // - No improvement or worse performance in later rounds
    // - Random clicking patterns (many wrong answers, fast times)
    const seriousnessAnalysis: Array<{
      user_name: string;
      theme_name: string;
      level: string;
      session_id: string;
      rounds_count: number;
      round1_percentage: number;
      final_percentage: number;
      improvement: number;
      avg_time_later_rounds: number;
      avg_time_round1: number;
      total_time_seconds: number;
      serious: boolean;
      reason: string;
      completed_at: string;
    }> = [];

    for (const [sessionId, session] of Object.entries(sessionAnalysis)) {
      const round1 = session.rounds.find(r => r.round === 1);
      const laterRounds = session.rounds.filter(r => r.round > 1);
      const finalRound = session.rounds[session.rounds.length - 1];

      if (!round1) continue;

      const avgTimeLaterRounds = laterRounds.length > 0
        ? laterRounds.reduce((sum, r) => sum + r.avgTimePerQuestion, 0) / laterRounds.length
        : 0;
      const improvement = finalRound.percentage - round1.percentage;
      const totalTimeSeconds = session.rounds.reduce((sum, r) => sum + (r.totalTime || 0), 0);

      // Determine if session was "serious"
      let serious = true;
      let reason = "";

      if (session.rounds.length === 1) {
        // Single round session
        if (round1.percentage === 100) {
          reason = "Perfect!";
        } else if (round1.percentage >= 80) {
          reason = "Good start";
        } else {
          reason = "Needs practice";
          serious = round1.avgTimePerQuestion >= 3; // Check if they took time
        }
      } else {
        // Multi-round session
        if (avgTimeLaterRounds < 3) {
          serious = false;
          reason = "Rushing";
        } else if (improvement < -10 && avgTimeLaterRounds < 5) {
          serious = false;
          reason = "Gave up";
        } else if (finalRound.percentage < round1.percentage && laterRounds.length > 2) {
          serious = false;
          reason = "Getting worse";
        } else if (finalRound.percentage === 100) {
          reason = "Mastered!";
        } else if (improvement > 20) {
          reason = "Great progress";
        } else if (improvement > 0) {
          reason = "Improving";
        } else {
          reason = "Struggling";
        }
      }

      seriousnessAnalysis.push({
        user_name: session.user_name,
        theme_name: session.theme_name,
        level: session.level,
        session_id: sessionId,
        rounds_count: session.rounds.length,
        round1_percentage: round1.percentage,
        final_percentage: finalRound.percentage,
        improvement,
        avg_time_later_rounds: Math.round(avgTimeLaterRounds * 10) / 10,
        avg_time_round1: Math.round(round1.avgTimePerQuestion * 10) / 10,
        total_time_seconds: totalTimeSeconds,
        serious,
        reason,
        completed_at: session.completed_at,
      });
    }

    // Get current theme mastery status (best round 1 score per theme/level)
    const themeMastery = await sql`
      SELECT
        user_id,
        user_name,
        theme_name,
        level,
        MAX(ROUND((score::float / NULLIF(total_questions, 0) * 100)::numeric, 0)) as best_percentage,
        COUNT(*) as attempts,
        MAX(completed_at) as last_attempt
      FROM quiz_results
      WHERE round = 1 AND is_test_mode = false
      GROUP BY user_id, user_name, theme_name, level
      ORDER BY user_name, theme_name,
        CASE level
          WHEN 'easy' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'hard' THEN 3
        END
    `;

    // Get repeated mistakes
    const mistakesRaw = await sql`
      SELECT
        user_name,
        theme_name,
        level,
        mistakes
      FROM quiz_results
      WHERE jsonb_array_length(mistakes) > 0 AND is_test_mode = false
      ORDER BY completed_at DESC
      LIMIT 200
    `;

    // ========== TEST MODE ANALYTICS ==========

    // Test mode summary stats per user
    const testSummaryStats = await sql`
      SELECT
        user_id,
        user_name,
        COUNT(*) as total_tests,
        SUM(total_questions) as total_questions,
        ROUND(AVG(score::float / NULLIF(total_questions, 0) * 100)::numeric, 1) as avg_percentage,
        ROUND(AVG(avg_time_per_question)::numeric, 1) as avg_time_per_question
      FROM quiz_results
      WHERE is_test_mode = true
      GROUP BY user_id, user_name
    `;

    // Test mode progress over time (each test attempt by level)
    const testProgress = await sql`
      SELECT
        user_id,
        user_name,
        level,
        completed_at,
        score,
        total_questions,
        ROUND((score::float / NULLIF(total_questions, 0) * 100)::numeric, 1) as percentage,
        total_time_seconds,
        all_answers
      FROM quiz_results
      WHERE is_test_mode = true
      ORDER BY user_name, level, completed_at
    `;

    // Test mode per-theme breakdown (how they performed on questions from each source theme)
    // This requires parsing the all_answers array which has sourceTheme for each question
    const testThemeBreakdown: Array<{
      user_name: string;
      source_theme: string;
      total_questions: number;
      correct_count: number;
      percentage: number;
    }> = [];

    const themeStats: Record<string, {
      user_name: string;
      source_theme: string;
      total: number;
      correct: number;
    }> = {};

    for (const row of testProgress.rows) {
      const allAnswers = row.all_answers as Array<{
        question: string;
        userAnswer: number | null;
        correctAnswer: number;
        sourceTheme?: string;
      }> || [];

      for (const ans of allAnswers) {
        const sourceTheme = ans.sourceTheme || "Unknown";
        const key = `${row.user_name}|${sourceTheme}`;

        if (!themeStats[key]) {
          themeStats[key] = {
            user_name: row.user_name,
            source_theme: sourceTheme,
            total: 0,
            correct: 0,
          };
        }

        themeStats[key].total++;
        if (ans.userAnswer === ans.correctAnswer) {
          themeStats[key].correct++;
        }
      }
    }

    for (const stat of Object.values(themeStats)) {
      testThemeBreakdown.push({
        user_name: stat.user_name,
        source_theme: stat.source_theme,
        total_questions: stat.total,
        correct_count: stat.correct,
        percentage: stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0,
      });
    }

    // Sort by user_name, then by percentage descending
    testThemeBreakdown.sort((a, b) => {
      if (a.user_name !== b.user_name) return a.user_name.localeCompare(b.user_name);
      return b.percentage - a.percentage;
    });

    // Get all individual quiz results for inbox view (both training and test)
    const allQuizResults = await sql`
      SELECT
        id,
        user_id,
        user_name,
        theme_name,
        level,
        round,
        score,
        total_questions,
        ROUND((score::float / NULLIF(total_questions, 0) * 100)::numeric, 1) as percentage,
        total_time_seconds,
        avg_time_per_question,
        completed_at,
        is_test_mode,
        session_id,
        all_answers,
        mistakes
      FROM quiz_results
      ORDER BY completed_at DESC
      LIMIT 500
    `;

    // Process mistakes
    const mistakeTracker: Record<string, {
      count: number;
      user_name: string;
      theme_name: string;
      level: string;
      question: string;
      correct_answer: string
    }> = {};

    for (const row of mistakesRaw.rows) {
      const mistakes = row.mistakes as Array<{
        question: string;
        correctAnswer: string;
      }>;

      for (const mistake of mistakes) {
        const key = `${row.user_name}|${mistake.question}`;
        if (!mistakeTracker[key]) {
          mistakeTracker[key] = {
            count: 0,
            user_name: row.user_name,
            theme_name: row.theme_name,
            level: row.level,
            question: mistake.question,
            correct_answer: mistake.correctAnswer,
          };
        }
        mistakeTracker[key].count++;
      }
    }

    const repeatedMistakes = Object.values(mistakeTracker)
      .filter((m) => m.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    // Debug: collect session info
    const sessionDebug = Object.entries(allSessions).map(([id, session]) => ({
      session_id: id,
      user_name: session.user_name,
      theme_name: session.theme_name,
      level: session.level,
      rounds_count: session.rounds.length,
      rounds: session.rounds.map(r => ({
        round: r.round,
        questions_count: r.answers.size,
        correct_count: Array.from(r.answers.values()).filter(a => a.correct).length,
        mistakes_count: Array.from(r.answers.values()).filter(a => !a.correct).length,
      })),
    }));

    return NextResponse.json({
      users: users.rows,
      summaryStats: summaryStats.rows,
      seriousnessStats,
      singleRoundStats: singleRoundStats.rows,
      round1Progress: round1Progress.rows,
      learningRateProgress,
      themeMastery: themeMastery.rows,
      repeatedMistakes,
      // Test mode analytics
      testSummaryStats: testSummaryStats.rows,
      testProgress: testProgress.rows,
      testThemeBreakdown,
      // Individual quiz results for inbox view
      allQuizResults: allQuizResults.rows,
      _debug_sessions: sessionDebug,
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
