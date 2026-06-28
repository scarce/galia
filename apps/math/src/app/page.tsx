"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import UserSelector from "@/components/UserSelector";
import PasscodeScreen from "@/components/PasscodeScreen";
import StreakCalendar from "@/components/StreakCalendar";
import { User } from "@/lib/types";

// Liquid-glass panel — client-only (canvas-based SVG displacement filter),
// loaded without SSR to avoid hydration mismatches.
const LiquidGlass = dynamic(
  () => import("@liquidglass/react").then((m) => m.LiquidGlass),
  { ssr: false },
);

interface Theme {
  id: string;
  name: string;
  description: string;
  icon: string;
}

// Map grades to available theme IDs
const GRADE_THEMES: Record<number, string[]> = {
  2: [
    "addition",
    "subtraction",
    "multiplication",
    "number-lines",
    "counting-large-numbers",
    "time-and-calendar",
  ],
  4: [
    "properties-of-operations",
    "order-of-operations",
    "word-problems",
    "work-rate",
  ],
  5: [
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

const themes: Theme[] = [
  {
    id: "addition",
    name: "Addition",
    description:
      "Practice adding numbers - from simple sums to two-digit addition",
    icon: "➕",
  },
  {
    id: "subtraction",
    name: "Subtraction",
    description: "Practice taking away - from basic subtraction to borrowing",
    icon: "➖",
  },
  {
    id: "multiplication",
    name: "Multiplication",
    description:
      "Times tables — from the 1s, 2s, 5s and 10s up to the full table",
    icon: "✖️",
  },
  {
    id: "order-of-operations",
    name: "Order of Operations",
    description:
      "Master PEMDAS - Parentheses, Exponents, Multiplication, Division, Addition, Subtraction",
    icon: "🧮",
  },
  {
    id: "work-rate",
    name: "Rate & Proportion",
    description:
      "Speed, distance, time, workers, filling tanks, and meeting problems",
    icon: "🚗",
  },
  {
    id: "geometry",
    name: "Geometry",
    description: "Angles, areas, perimeters, circles, 3D shapes, and nets",
    icon: "📐",
  },
  {
    id: "algebra",
    name: "Algebra",
    description: "Equations, expressions, patterns, and word problems",
    icon: "🔢",
  },
  {
    id: "word-problems-useless",
    name: "Filter the Info",
    description: "Word problems with useless information - find what matters!",
    icon: "🔍",
  },
  {
    id: "logic-gates",
    name: "Logic & Binary",
    description: "Logic gates, truth tables, binary numbers, and circuits",
    icon: "🔌",
  },
  {
    id: "computer-science",
    name: "Computer Science",
    description: "Architecture, OS, networks, and Swift programming basics",
    icon: "💻",
  },
  {
    id: "number-lines",
    name: "Number Lines",
    description:
      "Read numbers on number lines - from basic counting to skip counting patterns",
    icon: "📏",
  },
  {
    id: "properties-of-operations",
    name: "Properties of Operations",
    description: "Distributive, commutative, and associative properties",
    icon: "🔄",
  },
  {
    id: "word-problems",
    name: "Word Problems",
    description:
      "Translate word problems into equations and solve step by step",
    icon: "📝",
  },
  {
    id: "time-and-calendar",
    name: "Time & Calendar",
    description: "Days, weeks, months, reading clocks, and elapsed time",
    icon: "🕐",
  },
  {
    id: "counting-large-numbers",
    name: "Counting Large Numbers",
    description: "Count fluently up to 1,000,000 with place value mastery",
    icon: "🔢",
  },
];

const levels = [
  {
    id: "easy",
    name: "Easy",
    color: "bg-green-500",
    description: "Simple calculations",
  },
  {
    id: "medium",
    name: "Medium",
    color: "bg-yellow-500",
    description: "More operations",
  },
  {
    id: "hard",
    name: "Hard",
    color: "bg-red-500",
    description: "Exponents & complex",
  },
];

type Mode = "training" | "test";

export default function Home() {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedMode, setSelectedMode] = useState<Mode>("training");
  // Set once the user picks what to play; opens the difficulty chooser.
  const [pendingTheme, setPendingTheme] = useState<Theme | null>(null);
  const [pendingTest, setPendingTest] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if already unlocked
    const isUnlocked = localStorage.getItem("unlocked") === "true";
    setUnlocked(isUnlocked);

    // Load users
    fetch("/api/users")
      .then((res) => res.json())
      .then((usersData) => {
        setUsers(usersData);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Retry any failed submissions from previous sessions
    const retryFailedSubmissions = async () => {
      const failedSubmissions = JSON.parse(
        localStorage.getItem("failedSubmissions") || "[]",
      );
      if (failedSubmissions.length === 0) return;

      const stillFailed: typeof failedSubmissions = [];

      for (const submission of failedSubmissions) {
        try {
          const response = await fetch("/api/results", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(submission),
          });

          if (!response.ok) {
            stillFailed.push(submission);
          } else {
            console.log(
              "Successfully retried failed submission:",
              submission.themeName,
              submission.round,
            );
          }
        } catch {
          stillFailed.push(submission);
        }
      }

      if (stillFailed.length > 0) {
        localStorage.setItem("failedSubmissions", JSON.stringify(stillFailed));
      } else {
        localStorage.removeItem("failedSubmissions");
      }
    };

    retryFailedSubmissions();
  }, []);

  // Launch once a difficulty is chosen from the floating panel.
  const handleSelectLevel = (levelId: string) => {
    if (!selectedUser) return;
    const grade = selectedUser.grade || 2;
    if (pendingTheme) {
      router.push(
        `/quiz?theme=${pendingTheme.id}-${levelId}&user=${selectedUser.id}&grade=${grade}`,
      );
    } else if (pendingTest) {
      router.push(
        `/quiz?mode=test&level=${levelId}&user=${selectedUser.id}&grade=${grade}`,
      );
    }
  };

  const closeDifficulty = () => {
    setPendingTheme(null);
    setPendingTest(false);
  };

  const handleBack = () => {
    setSelectedUser(null);
    setSelectedMode("training");
    closeDifficulty();
  };

  // Show loading state
  if (unlocked === null || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-6xl">🧮</div>
          <p className="text-xl text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show passcode screen if not unlocked
  if (!unlocked) {
    return <PasscodeScreen onUnlock={() => setUnlocked(true)} />;
  }

  // Two steps now: pick a profile, then the home hub (streak + difficulty +
  // topics/test). Difficulty is an inline panel, not a separate screen.
  const step = !selectedUser ? "user" : "home";
  const isHome = step === "home" && !!selectedUser;

  return (
    <div className="flex min-h-screen flex-col p-6 pt-10 md:p-10">
      {/* Top bar: branding on the left, streak calendar on the right.
          Full-bleed indigo bar spanning the whole page width. */}
      <header
        className={`-mx-6 -mt-10 mb-10 flex flex-col gap-6 bg-[#4F39F6] px-6 pt-10 pb-8 md:-mx-10 md:-mt-10 md:px-10 ${
          isHome
            ? "lg:flex-row lg:items-center lg:justify-between"
            : "items-center text-center"
        }`}
      >
        <div className={isHome ? "text-center lg:text-left" : "text-center"}>
          <h1 className="mb-2 text-5xl font-extrabold text-white md:text-6xl">
            galia/math
          </h1>
          <p className="text-lg text-indigo-100 md:text-xl">
            {step === "user" && "Select your profile to begin"}
            {isHome &&
              selectedMode === "training" &&
              "Pick a topic and keep your rings closed"}
            {isHome &&
              selectedMode === "test" &&
              "Ready for a mixed test?"}
          </p>
        </div>

        {isHome && selectedUser && (
          <div className="w-full lg:w-auto lg:max-w-sm">
            <StreakCalendar userId={selectedUser.id} />
          </div>
        )}
      </header>

      {/* Controls: back + mode toggle */}
      <div
        className={`mb-8 flex flex-wrap items-center gap-3 ${
          isHome ? "justify-center lg:justify-start" : "justify-center"
        }`}
      >
        {selectedUser && (
          <button
            onClick={handleBack}
            className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-200"
          >
            ← Back
          </button>
        )}

        {selectedUser && (
          <div className="flex items-center gap-2 rounded-full bg-gray-100 p-1">
            <button
              onClick={() => setSelectedMode("training")}
              className={`rounded-full px-6 py-2 text-sm font-semibold transition-all ${
                selectedMode === "training"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              Training
            </button>
            <button
              onClick={() => setSelectedMode("test")}
              className={`rounded-full px-6 py-2 text-sm font-semibold transition-all ${
                selectedMode === "test"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              Test
            </button>
          </div>
        )}

        {selectedUser && (
          <button
            onClick={() => router.push(`/profile?user=${selectedUser.id}`)}
            className="flex items-center gap-2 rounded-full bg-amber-400 px-5 py-2 text-sm font-bold text-amber-950 shadow-sm transition-all hover:scale-105 hover:bg-amber-300 active:scale-95"
          >
            👤 Profile
          </button>
        )}
      </div>

      {/* User selection */}
      {step === "user" && (
        <div className="flex flex-col items-center">
          <UserSelector
            users={users}
            selectedUser={selectedUser}
            onSelectUser={setSelectedUser}
          />
        </div>
      )}

      {/* Training: topic grid - click opens the difficulty chooser */}
      {isHome && selectedUser && selectedMode === "training" && (
        <main className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {themes
            .filter((theme) => {
              const userGrade = selectedUser.grade || 2;
              const gradeThemes = GRADE_THEMES[userGrade] || [];
              return gradeThemes.includes(theme.id);
            })
            .map((theme) => (
              <button
                key={theme.id}
                onClick={() => setPendingTheme(theme)}
                className="flex w-full flex-col items-center gap-4 rounded-3xl bg-white p-8 shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-95"
              >
                <span className="text-6xl">{theme.icon}</span>
                <div className="text-center">
                  <h2 className="text-xl font-bold text-gray-800 md:text-2xl">
                    {theme.name}
                  </h2>
                  <p className="mt-2 text-sm text-gray-500 md:text-base">
                    {theme.description}
                  </p>
                </div>
              </button>
            ))}
        </main>
      )}

      {/* Test: single call-to-action opens the difficulty chooser */}
      {isHome && selectedMode === "test" && (
        <main className="mx-auto flex w-full max-w-md flex-col items-center">
          <button
            onClick={() => setPendingTest(true)}
            className="flex w-full flex-col items-center gap-3 rounded-3xl bg-indigo-600 p-10 text-white shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-95"
          >
            <span className="text-6xl">📝</span>
            <h2 className="text-2xl font-bold">Start Test</h2>
            <p className="text-sm text-white/80">
              40 questions from all topics
            </p>
          </button>
        </main>
      )}

      {/* Difficulty chooser - floating liquid-glass panel over a dimmed backdrop,
          shown only after a topic (or the test) is selected */}
      {(pendingTheme || pendingTest) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          {/* Light backdrop - click to dismiss. Kept subtle (no blur) so the
              glass lens reveals a clear, saturated view of what it covers. */}
          <div
            className="absolute inset-0 bg-black/20"
            onClick={closeDifficulty}
          />
          {/* Sized wrapper; LiquidGlass fills it and centers its children */}
          <div className="relative z-10 w-full max-w-xl">
            <LiquidGlass
              borderRadius={44}
              blur={3}
              contrast={1.3}
              brightness={1.12}
              saturation={2.2}
              displacementScale={160}
              elasticity={0}
              shadowIntensity={0.35}
              className="w-full"
            >
              <div className="flex w-full flex-col items-center gap-8 p-10 md:p-12">
                <div className="text-center">
                  <div className="text-6xl drop-shadow">
                    {pendingTheme ? pendingTheme.icon : "📝"}
                  </div>
                  <h2 className="mt-3 text-4xl font-black tracking-tight text-white drop-shadow-lg md:text-5xl">
                    {pendingTheme ? pendingTheme.name : "Mixed Test"}
                  </h2>
                  <p className="mt-1 text-lg font-semibold text-white/90 drop-shadow md:text-xl">
                    Choose your difficulty
                  </p>
                </div>
                <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
                  {levels.map((level) => (
                    <button
                      key={level.id}
                      onClick={() => handleSelectLevel(level.id)}
                      className={`flex min-w-[10rem] flex-col items-center gap-2 rounded-3xl px-8 py-7 text-white shadow-xl transition-all duration-200 hover:scale-110 active:scale-95 ${level.color}`}
                    >
                      <span className="text-4xl font-black drop-shadow">
                        {level.id === "easy"
                          ? "⭐"
                          : level.id === "medium"
                            ? "⭐⭐"
                            : "⭐⭐⭐"}
                      </span>
                      <span className="text-2xl font-black">{level.name}</span>
                      <span className="text-sm font-medium text-white/85">
                        {level.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </LiquidGlass>
          </div>
        </div>
      )}

      <footer className="mt-12 text-center text-sm text-gray-500">
        {selectedMode === "test" ? (
          <p>40 questions from all topics • 1h30 total time • Good luck!</p>
        ) : (
          <p>40 questions • 1h30 total time • Good luck!</p>
        )}
      </footer>
    </div>
  );
}
