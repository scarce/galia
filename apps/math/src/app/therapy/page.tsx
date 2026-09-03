"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  THERAPY_TOPICS,
  JOURNAL_PROMPTS,
  type JournalEntry,
} from "@/lib/journal-prompts";

interface User {
  id: string;
  name: string;
  grade: number;
  color: string;
  bgColor: string;
}

function TherapyPage() {
  const router = useRouter();
  const params = useSearchParams();
  const userId = params.get("user");
  const [user, setUser] = useState<User | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [showGenericEditor, setShowGenericEditor] = useState(false);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [view, setView] = useState<"topics" | "recent" | "archive">("topics");
  const [pendingArchive, setPendingArchive] = useState<{
    id: number;
    archived: boolean;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  const loadEntries = useCallback(() => {
    if (!userId) return;
    fetch(`/api/journal?user=${encodeURIComponent(userId)}`)
      .then((res) => res.json())
      .then((data) => setEntries(data.entries || []))
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      router.push("/");
      return;
    }

    fetch("/api/users")
      .then((res) => res.json())
      .then((users: User[]) => {
        const found = users.find((u) => u.id === userId);
        setUser(found || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    loadEntries();
  }, [userId, router, loadEntries]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-6xl">🧘</div>
          <p className="text-xl text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-xl text-gray-600">User not found</p>
          <button
            onClick={() => router.push("/")}
            className="rounded-full bg-indigo-600 px-6 py-3 text-sm font-bold text-white"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  const color = user.color || "#4F39F6";
  const isHome = !!selectedTopic;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header style={{ backgroundColor: color }} className="px-6 pt-8 pb-14 md:px-10">
        <button
          onClick={() => router.push(`/?user=${userId}`)}
          className="mb-6 flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/30"
        >
          ← Back
        </button>
        <div className="flex items-center gap-5">
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl font-black text-white shadow-lg ring-4"
            style={{ backgroundColor: `${color}80`, borderColor: `${color}40` }}
          >
            {user.name[0]}
          </div>
          <div className="text-white">
            <h1 className="text-4xl font-black md:text-5xl">{user.name}</h1>
            <p className="text-sm font-semibold text-white/80">
              Mindfulness & Wellness
            </p>
            {selectedTopic && (
              <p className="mt-2 text-sm font-semibold text-white/90">
                {THERAPY_TOPICS.find((t) => t.id === selectedTopic)?.name}
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-col p-6 pt-10 md:p-10">
        {/* Navigation pills */}
        {!selectedTopic && (
          <div className="mb-8 flex items-center justify-center gap-2 rounded-full bg-gray-100 p-1 lg:justify-start">
            <button
              onClick={() => setView("topics")}
              className={`rounded-full px-6 py-2 text-sm font-semibold transition-all ${
                view === "topics"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              Topics
            </button>
            <button
              onClick={() => setView("recent")}
              className={`rounded-full px-6 py-2 text-sm font-semibold transition-all ${
                view === "recent"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              Recent
            </button>
            <button
              onClick={() => setView("archive")}
              className={`rounded-full px-6 py-2 text-sm font-semibold transition-all ${
                view === "archive"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              Archive
            </button>
          </div>
        )}

        {/* Back button when in topic view */}
        {selectedTopic && (
          <div className="mb-8 flex items-center justify-center lg:justify-start">
            <button
              onClick={() => {
                setSelectedTopic(null);
                setPendingPrompt(null);
              }}
              className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-200"
            >
              ← Back
            </button>
          </div>
        )}

      {/* Topics grid */}
      {!selectedTopic && view === "topics" && (
        <main className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {THERAPY_TOPICS.map((topic) => (
            <button
              key={topic.id}
              onClick={() => setSelectedTopic(topic.id)}
              className="flex flex-col items-center gap-4 rounded-3xl bg-white p-8 shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-95"
            >
              <span className="text-6xl">{topic.icon}</span>
              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-800 md:text-2xl">
                  {topic.name}
                </h2>
                <p className="mt-2 text-sm text-gray-500 md:text-base">
                  {topic.description}
                </p>
              </div>
            </button>
          ))}
        </main>
      )}

      {/* Recent entries view */}
      {!selectedTopic && view === "recent" && (
        <main className="mx-auto w-full max-w-5xl">
          {entries.filter((e) => !e.archived).length === 0 ? (
            <div className="text-center text-gray-500">
              No entries yet. Start with a topic or write freely!
            </div>
          ) : (
            <div className="space-y-4">
              {entries
                .filter((e) => !e.archived)
                .slice(0, 20)
                .map((entry) => {
                  const category = THERAPY_TOPICS.find(
                    (t) => t.id === entry.topicCategory,
                  );
                  const prompts =
                    JOURNAL_PROMPTS[
                      entry.topicCategory as keyof typeof JOURNAL_PROMPTS
                    ] || [];
                  const prompt = prompts.find((p) => p.id === entry.topic);
                  const date = new Date(entry.createdAt).toLocaleDateString(
                    undefined,
                    {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  );

                  return (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 rounded-2xl bg-white p-5 shadow-sm transition-all hover:shadow-md"
                    >
                      <button
                        onClick={() =>
                          setPendingArchive({ id: entry.id, archived: true })
                        }
                        className="mt-1 shrink-0 flex h-6 w-6 items-center justify-center rounded border-2 border-gray-300 text-gray-400 transition hover:border-gray-400 hover:bg-gray-50"
                        aria-label="Archive entry"
                      />
                      <button
                        onClick={() => setSelectedEntry(entry)}
                        className="flex-1 text-left active:scale-95"
                      >
                        <div className="flex items-start gap-4">
                          <span className="text-3xl">
                            {prompt?.emoji || category?.icon || "📝"}
                          </span>
                          <div className="flex-1">
                            <h3 className="font-bold text-gray-800">
                              {prompt?.title || "Free writing"}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                              {entry.content}
                            </p>
                            <p className="mt-2 text-xs text-gray-400">
                              {date}
                            </p>
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </main>
      )}

      {/* Archive (all entries) view */}
      {!selectedTopic && view === "archive" && (
        <main className="mx-auto w-full max-w-5xl">
          {entries.filter((e) => e.archived).length === 0 ? (
            <div className="text-center text-gray-500">
              No archived entries yet. Archive entries from Recent to see them here!
            </div>
          ) : (
            <div className="space-y-4">
              {entries.filter((e) => e.archived).map((entry) => {
                const category = THERAPY_TOPICS.find(
                  (t) => t.id === entry.topicCategory,
                );
                const prompts =
                  JOURNAL_PROMPTS[
                    entry.topicCategory as keyof typeof JOURNAL_PROMPTS
                  ] || [];
                const prompt = prompts.find((p) => p.id === entry.topic);
                const date = new Date(entry.createdAt).toLocaleDateString(
                  undefined,
                  {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                );

                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2 rounded-2xl bg-white p-5 shadow-sm transition-all hover:shadow-md"
                  >
                    <button
                      onClick={() =>
                        setPendingArchive({
                          id: entry.id,
                          archived: false,
                        })
                      }
                      className="mt-1 shrink-0 flex h-6 w-6 items-center justify-center rounded border-2 border-green-400 bg-green-50 text-green-600 transition hover:bg-green-100"
                      aria-label="Restore to Recent"
                      title="Restore to Recent"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => setPendingDelete(entry.id)}
                      className="mt-1 shrink-0 flex h-6 w-6 items-center justify-center rounded border-2 border-red-300 text-red-400 transition hover:border-red-400 hover:bg-red-50"
                      aria-label="Delete entry"
                      title="Delete entry"
                    >
                      🗑️
                    </button>
                    <button
                      onClick={() => setSelectedEntry(entry)}
                      className="flex-1 text-left active:scale-95"
                    >
                      <div className="flex items-start gap-4">
                        <span className="text-3xl">
                          {prompt?.emoji || category?.icon || "📝"}
                        </span>
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-800">
                            {prompt?.title || "Free writing"}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                            {entry.content}
                          </p>
                          <p className="mt-2 text-xs text-gray-400">
                            {date}
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* Prompts grid - when topic selected */}
      {isHome && selectedTopic && (
        <main className="mx-auto w-full max-w-5xl">
          <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(JOURNAL_PROMPTS[selectedTopic as keyof typeof JOURNAL_PROMPTS] ||
              [])
              .map((prompt) => {
                const lastWritten = entries.find(
                  (e) => e.topic === prompt.id,
                )?.createdAt;
                return (
                  <button
                    key={prompt.id}
                    onClick={() => setPendingPrompt(prompt.id)}
                    className="flex flex-col items-center gap-4 rounded-3xl bg-white p-8 shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-95"
                  >
                    <span className="text-6xl">{prompt.emoji}</span>
                    <div className="text-center">
                      <h3 className="text-lg font-bold text-gray-800">
                        {prompt.title}
                      </h3>
                      {lastWritten && (
                        <p className="mt-2 text-xs text-gray-400">
                          {new Date(lastWritten).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
          </div>

          {/* Recent entries for this topic */}
          {entries.filter((e) => e.topicCategory === selectedTopic).length > 0 && (
            <div className="mt-12">
              <h3 className="mb-4 text-lg font-bold text-gray-800">
                📝 Recent entries
              </h3>
              <div className="space-y-4">
                {entries
                  .filter((e) => e.topicCategory === selectedTopic)
                  .slice(0, 5)
                  .map((entry) => {
                    const prompt = (
                      JOURNAL_PROMPTS[
                        selectedTopic as keyof typeof JOURNAL_PROMPTS
                      ] || []
                    ).find((p) => p.id === entry.topic);
                    const date = new Date(entry.createdAt).toLocaleDateString(
                      undefined,
                      {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    );
                    return (
                      <button
                        key={entry.id}
                        onClick={() => setSelectedEntry(entry)}
                        className="w-full rounded-2xl bg-white p-5 text-left shadow-sm transition-all hover:shadow-md active:scale-95"
                      >
                        <div className="flex items-start gap-4">
                          <span className="text-3xl">{prompt?.emoji}</span>
                          <div className="flex-1">
                            <h3 className="font-bold text-gray-800">
                              {prompt?.title}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                              {entry.content}
                            </p>
                            <p className="mt-2 text-xs text-gray-400">
                              {date}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </main>
      )}

      {/* Journal Editor Modal */}
      {pendingPrompt && userId && selectedTopic && (
        <JournalEditor
          userId={userId}
          topicCategory={selectedTopic}
          promptId={pendingPrompt}
          color={color}
          onClose={() => setPendingPrompt(null)}
          onSave={() => {
            setPendingPrompt(null);
            loadEntries();
          }}
        />
      )}

      {/* Entry Detail Modal */}
      {selectedEntry && (
        <EntryDetail
          entry={selectedEntry}
          color={color}
          onClose={() => setSelectedEntry(null)}
        />
      )}

      {/* All Entries Modal */}
      {showAllEntries && (
        <AllEntriesModal
          entries={entries}
          color={color}
          onClose={() => setShowAllEntries(false)}
          onSelectEntry={setSelectedEntry}
        />
      )}

      {/* Floating Action Button */}
      <button
        onClick={() => setShowGenericEditor(true)}
        className="fixed bottom-8 right-8 flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition-all hover:scale-110 active:scale-95"
        style={{ backgroundColor: color }}
        aria-label="Add a journal entry"
      >
        <span className="text-2xl font-bold text-white">+</span>
      </button>

      {/* Generic Journal Editor Modal */}
      {showGenericEditor && userId && (
        <GenericJournalEditor
          userId={userId}
          color={color}
          onClose={() => setShowGenericEditor(false)}
          onSave={() => {
            setShowGenericEditor(false);
            loadEntries();
          }}
        />
      )}

      {/* Confirm Archive Modal */}
      {pendingArchive && (
        <ConfirmArchiveModal
          archived={pendingArchive.archived}
          color={color}
          onConfirm={async () => {
            try {
              await fetch("/api/journal/archive", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: pendingArchive.id,
                  archived: pendingArchive.archived,
                }),
              });
              loadEntries();
            } catch {
              // error handling
            }
            setPendingArchive(null);
          }}
          onCancel={() => setPendingArchive(null)}
        />
      )}

      {/* Confirm Delete Modal */}
      {pendingDelete && (
        <ConfirmDeleteModal
          color={color}
          onConfirm={async () => {
            try {
              await fetch("/api/journal/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: pendingDelete }),
              });
              loadEntries();
            } catch {
              // error handling
            }
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      </div>
    </div>
  );
}

function JournalEditor({
  userId,
  topicCategory,
  promptId,
  color,
  onClose,
  onSave,
}: {
  userId: string;
  topicCategory: string;
  promptId: string;
  color: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const prompts =
    JOURNAL_PROMPTS[topicCategory as keyof typeof JOURNAL_PROMPTS] || [];
  const prompt = prompts.find((p) => p.id === promptId);
  if (!prompt) return null;

  const submit = async () => {
    if (!content.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          topicCategory,
          topic: promptId,
          content: content.trim(),
        }),
      });
      if (res.ok) {
        onSave();
      }
    } catch {
      // error handling
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-lg font-bold text-gray-500 transition hover:bg-gray-200 active:scale-90"
        >
          ✕
        </button>

        <div className="p-6 md:p-8">
          <div className="mb-6 flex items-center gap-4">
            <span className="text-5xl">{prompt.emoji}</span>
            <div>
              <h2 className="text-2xl font-black text-gray-800">
                {prompt.title}
              </h2>
              <p className="mt-1 text-sm text-gray-600">{prompt.prompt}</p>
            </div>
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            autoFocus
            placeholder="Start writing..."
            rows={10}
            className="w-full resize-none rounded-2xl border-2 border-gray-200 p-4 text-base text-gray-800 outline-none focus:border-gray-400"
          />

          <div className="mt-6 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-full bg-gray-100 px-4 py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-200 active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!content.trim() || saving}
              style={
                content.trim() && !saving ? { backgroundColor: color } : undefined
              }
              className="flex-1 rounded-full px-4 py-3 text-sm font-black text-white shadow transition active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {saving ? "Saving…" : "Save Entry"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EntryDetail({
  entry,
  color,
  onClose,
}: {
  entry: JournalEntry;
  color: string;
  onClose: () => void;
}) {
  const prompts =
    JOURNAL_PROMPTS[entry.topicCategory as keyof typeof JOURNAL_PROMPTS] || [];
  const prompt = prompts.find((p) => p.id === entry.topic);
  const date = new Date(entry.createdAt).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white p-8 shadow-2xl"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-lg font-bold text-gray-500 transition hover:bg-gray-200 active:scale-90"
        >
          ✕
        </button>

        <div className="mb-6 flex items-center gap-4">
          <span className="text-5xl">{prompt?.emoji}</span>
          <div>
            <h2 className="text-2xl font-black text-gray-800">
              {prompt?.title}
            </h2>
            <p className="mt-1 text-sm text-gray-500">{date}</p>
          </div>
        </div>

        <div className="whitespace-pre-wrap rounded-2xl bg-gray-50 p-5 text-base text-gray-800">
          {entry.content}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-full px-4 py-3 text-sm font-bold text-white shadow transition hover:scale-105 active:scale-95"
          style={{ backgroundColor: color }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function AllEntriesModal({
  entries,
  color,
  onClose,
  onSelectEntry,
}: {
  entries: JournalEntry[];
  color: string;
  onClose: () => void;
  onSelectEntry: (entry: JournalEntry) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const topicCategories = THERAPY_TOPICS.reduce(
    (acc, topic) => {
      acc[topic.id] = topic;
      return acc;
    },
    {} as Record<string, (typeof THERAPY_TOPICS)[0]>,
  );

  const getPrompt = (topicCategory: string, promptId: string) => {
    const prompts =
      JOURNAL_PROMPTS[topicCategory as keyof typeof JOURNAL_PROMPTS] || [];
    return prompts.find((p) => p.id === promptId);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="sticky top-0 border-b border-gray-200 bg-white p-6 md:p-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-gray-800">
              📖 All entries ({entries.length})
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-lg font-bold text-gray-500 transition hover:bg-gray-200 active:scale-90"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-6 md:p-8">
          {entries.length === 0 ? (
            <p className="text-center text-gray-500">No entries yet</p>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => {
                const category = topicCategories[entry.topicCategory];
                const prompt = getPrompt(entry.topicCategory, entry.topic);
                const date = new Date(entry.createdAt).toLocaleDateString(
                  undefined,
                  {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                );

                return (
                  <button
                    key={entry.id}
                    onClick={() => {
                      onSelectEntry(entry);
                      onClose();
                    }}
                    className="w-full rounded-2xl bg-white border-2 border-gray-200 p-5 text-left transition-all hover:border-gray-300 hover:shadow-md active:scale-95"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex shrink-0 flex-col items-center gap-1">
                        <span className="text-2xl">
                          {prompt?.emoji || category?.icon || "📝"}
                        </span>
                        <span className="text-xs font-bold text-gray-400">
                          {category?.name}
                        </span>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-800">
                          {prompt?.title || "Free writing"}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                          {entry.content}
                        </p>
                        <p className="mt-2 text-xs text-gray-400">{date}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({
  color,
  onConfirm,
  onCancel,
}: {
  color: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white p-8 shadow-2xl"
      >
        <h2 className="text-2xl font-black text-gray-800">
          Delete this entry?
        </h2>
        <p className="mt-3 text-sm text-gray-600">
          This will delete the entry from view.
        </p>

        <div className="mt-8 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-full bg-gray-100 px-4 py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-200 active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-full bg-red-500 px-4 py-3 text-sm font-black text-white shadow transition active:scale-95 hover:bg-red-600"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmArchiveModal({
  archived,
  color,
  onConfirm,
  onCancel,
}: {
  archived: boolean;
  color: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white p-8 shadow-2xl"
      >
        <h2 className="text-2xl font-black text-gray-800">
          {archived ? "Archive this entry?" : "Unarchive this entry?"}
        </h2>
        <p className="mt-3 text-sm text-gray-600">
          {archived
            ? "Move this entry to your archive. You can still view it there."
            : "Move this entry back to your recent entries."}
        </p>

        <div className="mt-8 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-full bg-gray-100 px-4 py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-200 active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ backgroundColor: color }}
            className="flex-1 rounded-full px-4 py-3 text-sm font-black text-white shadow transition active:scale-95"
          >
            {archived ? "Archive" : "Unarchive"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GenericJournalEditor({
  userId,
  color,
  onClose,
  onSave,
}: {
  userId: string;
  color: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!content.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          topicCategory: "free",
          topic: "free_writing",
          content: content.trim(),
        }),
      });
      if (res.ok) {
        onSave();
      }
    } catch {
      // error handling
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-lg font-bold text-gray-500 transition hover:bg-gray-200 active:scale-90"
        >
          ✕
        </button>

        <div className="p-6 md:p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-black text-gray-800">
              Write freely
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              No prompt, just your thoughts.
            </p>
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            autoFocus
            placeholder="What's on your mind?"
            rows={10}
            className="w-full resize-none rounded-2xl border-2 border-gray-200 p-4 text-base text-gray-800 outline-none focus:border-gray-400"
          />

          <div className="mt-6 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-full bg-gray-100 px-4 py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-200 active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!content.trim() || saving}
              style={
                content.trim() && !saving ? { backgroundColor: color } : undefined
              }
              className="flex-1 rounded-full px-4 py-3 text-sm font-black text-white shadow transition active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-6xl">🧘</div>
        </div>
      }
    >
      <TherapyPage />
    </Suspense>
  );
}
