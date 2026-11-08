import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

interface Question {
  id: number;
  question: string;
  answers: string[];
  correct: number;
  hint?: string;
  sourceTheme?: string;
}

interface QuizData {
  theme: string;
  themeId: string;
  level: string;
  totalTimeMinutes: number;
  questionTimeMinutes: number;
  questions: Question[];
}

// Map grades to available theme IDs
const GRADE_THEMES: Record<number, string[]> = {
  2: [
    "addition",
    "subtraction",
    "number-lines",
    "counting-large-numbers",
    "time-and-calendar",
  ],
  4: [
    "us-measurements",
    "properties-of-operations",
    "order-of-operations",
    "word-problems",
    "work-rate",
  ],
  5: [
    "us-measurements",
    "algebra",
    "order-of-operations",
    "work-rate",
    "geometry",
    "properties-of-operations",
    "word-problems",
    "word-problems-useless",
    "logic-gates",
    "computer-science",
  ],
};

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const level = searchParams.get("level");
  const userId = searchParams.get("user");
  const gradeParam = searchParams.get("grade");

  if (!level || !userId) {
    return NextResponse.json(
      { error: "Missing level or user parameter" },
      { status: 400 },
    );
  }

  if (!["easy", "medium", "hard"].includes(level)) {
    return NextResponse.json(
      { error: "Invalid level. Must be easy, medium, or hard" },
      { status: 400 },
    );
  }

  // Get grade from parameter or derive from user
  let grade = gradeParam ? parseInt(gradeParam) : 2;

  // If no grade param, try to get it from USER_GRADES env var
  if (!gradeParam) {
    const usersEnv = process.env.USERS!;
    const userNames = usersEnv.split(",").map((name) => name.trim());
    const userName = userNames.find((name) => name[0].toUpperCase() === userId);

    if (userName) {
      const userGradesEnv = process.env.USER_GRADES || "";
      const gradeMatch = userGradesEnv.split(",").find((entry) => {
        const [name] = entry.split(":");
        return name.trim() === userName;
      });
      if (gradeMatch) {
        const [, g] = gradeMatch.split(":");
        grade = parseInt(g) || 2;
      }
    }
  }

  const themes = GRADE_THEMES[grade] || [];

  if (themes.length === 0) {
    return NextResponse.json(
      { error: "No themes available for this grade" },
      { status: 404 },
    );
  }

  const dataDir = path.join(process.cwd(), "src", "data", `grade-${grade}`);
  const allQuestions: Question[] = [];
  const accessibleThemes: string[] = [];

  // Load questions from all themes for this grade
  for (const theme of themes) {
    const filePath = path.join(dataDir, `${theme}-${level}.json`);

    try {
      const fileContent = await fs.readFile(filePath, "utf-8");
      const quizData: QuizData = JSON.parse(fileContent);

      accessibleThemes.push(theme);

      // Add questions with source theme info
      const questionsWithSource = quizData.questions.map((q) => ({
        ...q,
        sourceTheme: quizData.theme,
      }));

      allQuestions.push(...questionsWithSource);
    } catch {
      // Theme file not found, skip
      continue;
    }
  }

  if (allQuestions.length === 0) {
    return NextResponse.json(
      { error: "No accessible themes found for this user" },
      { status: 404 },
    );
  }

  // Shuffle all questions
  const shuffledQuestions = shuffleArray(allQuestions);

  // Take 40 questions (or all if less than 40)
  const selectedQuestions = shuffledQuestions.slice(0, 40);

  // Re-number the questions for the test
  const numberedQuestions = selectedQuestions.map((q, index) => ({
    ...q,
    id: index + 1,
  }));

  const testQuiz = {
    theme: "Test - All Topics",
    themeId: `test-${level}`,
    level,
    totalTimeMinutes: 90,
    questionTimeMinutes: 2,
    questions: numberedQuestions,
    accessibleThemes,
  };

  return NextResponse.json(testQuiz);
}
