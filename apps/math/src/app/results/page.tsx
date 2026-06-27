"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { QuizResult, User, Mistake } from "@/lib/types";
import RewardPopup, { hasRewards } from "@/components/RewardPopup";
import { type EarnedRewards } from "@/lib/rewards";

// Combine rewards across the rounds of one quiz session (loot lands on round 1;
// extra badges can come from later rounds).
function mergeRewards(
  a: EarnedRewards | null,
  b: EarnedRewards | null,
): EarnedRewards | null {
  if (!a) return b;
  if (!b) return a;
  const byId = <T extends { id: string }>(arr: T[]) => [
    ...new Map(arr.map((x) => [x.id, x])).values(),
  ];
  return {
    badges: byId([...a.badges, ...b.badges]),
    collectible: a.collectible ?? b.collectible,
    tickets: [...a.tickets, ...b.tickets],
    familyGoals: byId([...a.familyGoals, ...b.familyGoals]),
    pointsEarned: (a.pointsEarned || 0) + (b.pointsEarned || 0),
  };
}

interface ExtendedQuizResult extends QuizResult {
  round?: number;
  grade?: number;
  isTestMode?: boolean;
  sessionId?: string;
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

// Helper: Convert Blob to base64 string
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:audio/mpeg;base64,")
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper: Convert base64 string to Blob
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

// Lesson Player Component for AI-generated lessons
function LessonPlayer({
  sessionId,
  userId,
  mistakes,
  themeName,
  userName,
  grade,
  onComplete,
}: {
  sessionId: string;
  userId: string;
  mistakes: Mistake[];
  themeName: string;
  userName: string;
  grade: number;
  onComplete: () => void;
}) {
  const [lessonText, setLessonText] = useState("");
  const [lessonLoading, setLessonLoading] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasListened, setHasListened] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lessonGeneratedRef = useRef(false);

  // Load or generate lesson on mount
  useEffect(() => {
    if (lessonGeneratedRef.current) return;
    lessonGeneratedRef.current = true;

    async function loadOrGenerateLesson() {
      try {
        // First, check if lesson already exists in database
        const existingResponse = await fetch(`/api/lessons?sessionId=${encodeURIComponent(sessionId)}`);
        const existingData = await existingResponse.json();

        if (existingData.found && existingData.lessonText) {
          // Use existing lesson
          setLessonText(existingData.lessonText);
          setLessonLoading(false);

          // If audio exists, use it; otherwise generate it
          if (existingData.lessonAudioBase64) {
            const audioBlob = base64ToBlob(existingData.lessonAudioBase64, "audio/mpeg");
            const url = URL.createObjectURL(audioBlob);
            setAudioUrl(url);
          } else {
            // Generate audio for existing text
            await generateAndSaveAudio(existingData.lessonText);
          }
          return;
        }

        // Generate new lesson
        const response = await fetch("/api/lesson", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mistakes, themeName, userName, grade }),
        });

        if (!response.ok) throw new Error("Failed to generate lesson");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          fullText += chunk;
          setLessonText(fullText);
        }

        setLessonLoading(false);

        // Generate audio and save everything
        await generateAndSaveAudio(fullText);

      } catch (err) {
        console.error("Lesson generation error:", err);
        setError("Failed to generate lesson. You can still proceed to Round 2.");
        setLessonLoading(false);
        setAudioLoading(false);
        onComplete();
      }
    }

    async function generateAndSaveAudio(text: string) {
      setAudioLoading(true);
      try {
        const audioResponse = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!audioResponse.ok) throw new Error("Failed to generate audio");

        const audioBlob = await audioResponse.blob();
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        setAudioLoading(false);

        // Convert blob to base64 and save to database
        const base64 = await blobToBase64(audioBlob);
        await fetch("/api/lessons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            userId,
            userName,
            themeName,
            grade,
            lessonText: text,
            lessonAudioBase64: base64,
          }),
        });
      } catch (err) {
        console.error("Audio generation error:", err);
        setAudioLoading(false);
        // Audio failed — skip the lesson audio and let them move on to Round 2
        // instead of getting stuck waiting to "listen".
        onComplete();
      }
    }

    loadOrGenerateLesson();
  }, [sessionId, userId, mistakes, themeName, userName, grade, onComplete]);

  // Audio event handlers
  const handlePlay = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, []);

  const handlePause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      const pct = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      setProgress(pct);
      // Mark as listened once 80% through
      if (pct >= 80 && !hasListened) {
        setHasListened(true);
        onComplete();
      }
    }
  }, [hasListened, onComplete]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setHasListened(true);
    onComplete();
  }, [onComplete]);

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl bg-yellow-50 p-6 text-center">
        <p className="text-yellow-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Lesson Card */}
      <div className="rounded-3xl bg-gradient-to-br from-purple-50 to-indigo-50 p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500 text-2xl">
            🎓
          </div>
          <div>
            <h2 className="text-xl font-bold text-purple-800">Your Personal Lesson</h2>
            <p className="text-sm text-purple-600">Listen before Round 2</p>
          </div>
        </div>

        {/* Loading state */}
        {lessonLoading && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-purple-600">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
              <span>Creating your personalized lesson...</span>
            </div>
            {lessonText && (
              <div className="max-h-48 overflow-y-auto rounded-xl bg-white/50 p-4 text-sm text-gray-700">
                {lessonText}
                <span className="animate-pulse">▊</span>
              </div>
            )}
          </div>
        )}

        {/* Lesson text (collapsed) */}
        {!lessonLoading && lessonText && (
          <details className="mb-4">
            <summary className="cursor-pointer text-sm text-purple-600 hover:text-purple-800">
              Show lesson text
            </summary>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-xl bg-white/50 p-4 text-sm text-gray-700">
              {lessonText}
            </div>
          </details>
        )}

        {/* Audio loading */}
        {audioLoading && (
          <div className="flex items-center gap-2 text-purple-600">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
            <span>Generating audio...</span>
          </div>
        )}

        {/* Audio player */}
        {audioUrl && (
          <div className="space-y-3">
            <audio
              ref={audioRef}
              src={audioUrl}
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleEnded}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />

            {/* Custom audio controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={isPlaying ? handlePause : handlePlay}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-purple-600 text-white shadow-lg transition-all hover:bg-purple-700 active:scale-95"
              >
                {isPlaying ? (
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                )}
              </button>

              {/* Progress bar */}
              <div className="flex-1">
                <div className="h-2 rounded-full bg-purple-200">
                  <div
                    className="h-full rounded-full bg-purple-600 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Listened indicator */}
              {hasListened && (
                <div className="flex items-center gap-1 text-green-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium">Done!</span>
                </div>
              )}
            </div>

            {!hasListened && (
              <p className="text-center text-sm text-purple-600">
                Listen to the lesson to unlock Round 2
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const router = useRouter();
  const [result, setResult] = useState<ExtendedQuizResult | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [lessonComplete, setLessonComplete] = useState(false);
  const [rewards, setRewards] = useState<EarnedRewards | null>(null);

  useEffect(() => {
    const storedResult = sessionStorage.getItem("quizResult");
    if (!storedResult) {
      router.push("/");
      return;
    }

    const parsedResult = JSON.parse(storedResult);
    setResult(parsedResult);

    // Rewards are computed on round 1 but only CELEBRATED when the whole quiz
    // is finished. Accumulate each round's rewards per session, and pop the
    // confetti only at completion (perfect score, or a one-shot test).
    const sid = parsedResult.sessionId || "nosession";
    const accKey = `rewardsAcc:${sid}`;
    try {
      const incoming = sessionStorage.getItem("quizRewards");
      if (incoming) {
        const prev = JSON.parse(sessionStorage.getItem(accKey) || "null");
        const merged = mergeRewards(prev, JSON.parse(incoming));
        sessionStorage.setItem(accKey, JSON.stringify(merged));
        sessionStorage.removeItem("quizRewards");
      }
      const acc = JSON.parse(sessionStorage.getItem(accKey) || "null");
      const isComplete =
        parsedResult.isTestMode ||
        parsedResult.score === parsedResult.questions.length;
      if (isComplete && acc && hasRewards(acc)) {
        setRewards(acc);
        sessionStorage.removeItem(accKey);
      }
    } catch {
      // ignore reward accumulation errors
    }

    // Load users to get the user info
    fetch("/api/users")
      .then((res) => res.json())
      .then((users) => {
        const foundUser = users.find((u: User) => u.id === parsedResult.userId);
        setUser(foundUser || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  if (loading || !result) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-6xl">📊</div>
          <p className="text-xl text-gray-600">Loading results...</p>
        </div>
      </div>
    );
  }
  const percentage = Math.round((result.score / result.questions.length) * 100);
  const avgTime =
    result.answerTimes && result.answerTimes.length > 0
      ? (result.answerTimes.reduce((a, b) => a + b, 0) / result.questions.length).toFixed(1)
      : "N/A";

  const emoji =
    percentage >= 90
      ? "🏆"
      : percentage >= 70
        ? "🌟"
        : percentage >= 50
          ? "👍"
          : "💪";

  return (
    <div className="min-h-screen p-4 md:p-8">
      {rewards && hasRewards(rewards) && (
        <RewardPopup
          rewards={rewards}
          userName={user?.name || result.userName}
          onClose={() => {
            setRewards(null);
            router.push(`/profile?user=${result.userId}`);
          }}
        />
      )}
      {/* Header */}
      <header className="mb-8 text-center">
        {user && (
          <div className="mb-4 flex items-center justify-center gap-3">
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold text-white ${user.bgColor}`}
            >
              {user.id}
            </span>
            <span className="text-2xl font-semibold text-gray-700">
              {user.name}&apos;s Results
            </span>
          </div>
        )}
        <h1 className="mb-2 text-4xl font-extrabold text-indigo-600 md:text-5xl">
          Quiz Complete! {emoji}
        </h1>
        <p className="text-lg text-gray-600">{result.themeName}</p>
      </header>

      {/* Score summary */}
      <div className="mx-auto mb-8 max-w-2xl rounded-3xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mb-4 text-6xl font-bold text-indigo-600 md:text-7xl">
            {result.score}/{result.questions.length}
          </div>
          <div className="text-2xl font-semibold text-gray-700">
            {percentage}% correct
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="text-sm text-gray-500">Total Time</div>
            <div className="text-xl font-bold text-gray-700">
              {formatTime(result.totalTime)}
            </div>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="text-sm text-gray-500">Avg per Question</div>
            <div className="text-xl font-bold text-gray-700">{avgTime}s</div>
          </div>
        </div>
      </div>

      {/* Next action */}
      {(() => {
        const mistakeCount = result.questions.length - result.score;
        const isPerfectScore = result.score === result.questions.length;
        const isRound1 = !result.round || result.round === 1;
        const isTrainingMode = !result.isTestMode;

        // Perfect score - show celebration
        if (isPerfectScore) {
          return (
            <div className="mx-auto max-w-4xl">
              <div className="rounded-3xl bg-green-50 p-8 text-center shadow-lg">
                <div className="mb-4 text-6xl">🎉</div>
                <h2 className="mb-2 text-3xl font-bold text-green-700">Perfect Score!</h2>
                <p className="text-lg text-green-600">
                  Congratulations! You answered all {result.questions.length} questions correctly
                  {result.round && result.round > 1 && ` in ${result.round} rounds`}!
                </p>
              </div>
            </div>
          );
        }

        // Not perfect - show lesson for Round 1 training, then Round X button
        const nextRound = (result.round || 1) + 1;

        // Get IDs of questions that were answered incorrectly
        const wrongQuestionIds = result.questions
          .filter((q, idx) => result.userAnswers[idx] !== q.correct)
          .map((q) => q.id);

        // Build mistakes array for lesson generation
        const mistakes: Mistake[] = result.questions
          .map((q, idx) => {
            if (result.userAnswers[idx] === q.correct) return null;
            return {
              questionNumber: idx + 1,
              question: q.question,
              userAnswer: result.userAnswers[idx] !== null ? q.answers[result.userAnswers[idx]!] : null,
              correctAnswer: q.answers[q.correct],
              hint: q.hint,
            };
          })
          .filter((m): m is Mistake => m !== null);

        // Show lesson for Round 1 training mode
        const showLesson = isRound1 && isTrainingMode && mistakes.length > 0;

        return (
          <div className="mx-auto max-w-2xl space-y-8">
            <p className="text-center text-lg text-gray-600">
              You got {mistakeCount} question{mistakeCount > 1 ? "s" : ""} wrong.
              {showLesson && !lessonComplete
                ? " Listen to your personalized lesson first!"
                : " Try again to improve your score!"}
            </p>

            {/* Lesson Player for Round 1 training */}
            {showLesson && result.sessionId && (
              <LessonPlayer
                sessionId={result.sessionId}
                userId={result.userId}
                mistakes={mistakes}
                themeName={result.themeName}
                userName={user?.name || "student"}
                grade={result.grade || 5}
                onComplete={() => setLessonComplete(true)}
              />
            )}

            {/* Round 2 button - shown after lesson complete (or immediately for non-Round-1) */}
            {(!showLesson || lessonComplete) && (
              <div className="text-center">
                <button
                  onClick={() => {
                    // Store wrong question IDs for next round
                    sessionStorage.setItem("wrongQuestionIds", JSON.stringify(wrongQuestionIds));
                    const gradeParam = result.grade ? `&grade=${result.grade}` : "";
                    router.push(`/quiz?theme=${result.themeId}&user=${result.userId}&round=${nextRound}${gradeParam}`);
                  }}
                  className="rounded-3xl bg-indigo-600 px-16 py-8 text-3xl font-bold text-white shadow-lg transition-all hover:bg-indigo-700 hover:shadow-xl active:scale-95"
                >
                  Round {nextRound}
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Actions - only show Back to Home for perfect scores */}
      {result.score === result.questions.length && (
        <div className="mx-auto mt-8 flex max-w-4xl justify-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="rounded-2xl bg-indigo-600 px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-indigo-700 active:scale-95"
          >
            Back to Home
          </button>
        </div>
      )}
    </div>
  );
}
