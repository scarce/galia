"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  RARITY_META,
  badgeImage,
  type Rarity,
  type UserStats,
} from "@/lib/rewards";
import { RULES } from "@/lib/reward-rules";

interface BadgeView {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: Rarity;
  earned: boolean;
  progress: { current: number; target: number } | null;
}
interface CollectibleView {
  id: string;
  name: string;
  icon: string;
  rarity: Rarity;
  girl: string; // whose face
  image: string;
  ownerId: string | null; // which girl won it (null = not yet found)
  earnedAt: string | null;
}
interface TicketView {
  rowId: number;
  id: string;
  name: string;
  icon: string;
  description: string;
  status: string;
}
interface FamilyGoalView {
  id: string;
  name: string;
  description: string;
  icon: string;
  reward: string;
  target: number;
  current: number;
  completed: boolean;
}
interface RewardsData {
  stats: UserStats;
  points: number;
  dollars: number;
  badges: BadgeView[];
  collectibles: CollectibleView[];
  deckSize: number;
  collectibleSet: string;
  tickets: TicketView[];
  familyGoals: FamilyGoalView[];
}
interface UserView {
  id: string;
  name: string;
  grade: number;
  color: string;
  bgColor: string;
}

type TabId = "collectibles" | "tickets" | "badges" | "family" | "how";

// ELI5 "how it works" cards — copy reflects the live reward-rules config.
function HowItWorks() {
  const c = RULES.collectible;
  const lp = c.levelPoints;
  const rate = RULES.redemption.dollarsPerPoint;
  const cards: { icon: string; title: string; body: string }[] = [
    {
      icon: "🔥",
      title: "Keep your streak",
      body: "Practise on school days (Mon–Fri). Weekends are free days! If you miss a weekday, you can catch up on the weekend and your streak keeps going.",
    },
    {
      icon: "⭐",
      title: "Your first try counts",
      body: "Only your FIRST try earns points and figures — so give it your best shot! You can still retry as many times as you like to learn (that won't lower anything).",
    },
    {
      icon: "🧸",
      title: "Collect figures with points",
      body: `Every quiz gives secret points if you score well enough: Hard = ${lp.hard.points} pts (${lp.hard.minResult}%+), Medium = ${lp.medium.points} pts (${lp.medium.minResult}%+), Easy = ${lp.easy.points} pts (${lp.easy.minResult}%+). Every ${c.pointsPerCollectible} points = a brand-new figure! So 1 Hard, or 2 Mediums, or 3 Easies.`,
    },
    {
      icon: "💰",
      title: "Points become real money",
      body: `At the end of ${RULES.season.name}, your points turn into real dollars — each point is worth about $${rate.toFixed(2)}. The harder you work, the more you save up!`,
    },
    {
      icon: "🏅",
      title: "Win badges",
      body: "Badges are special trophies for big moments: your very first quiz, a 7-day streak, being brave with Hard quizzes, bouncing back after a tricky day, and lots more.",
    },
    {
      icon: "🎫",
      title: "Golden Tickets",
      body: "Super rare! Get a perfect score for a chance to win one, or unlock one with a legendary badge. Trade them with your grown-ups for treats like movie night, staying up late, or a giant hug.",
    },
    {
      icon: "🏠",
      title: "Team up with your sisters",
      body: "Some goals are for the whole family. When you all practise together you unlock big family rewards — like a pizza night!",
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {cards.map((card) => (
        <div key={card.title} className="flex gap-4 rounded-2xl bg-white p-5 shadow-sm">
          <span className="text-4xl">{card.icon}</span>
          <div>
            <h3 className="font-party text-xl text-gray-800">{card.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">{card.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({
  children,
  sub,
}: {
  children: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <h2 className="text-2xl font-extrabold text-gray-800 md:text-3xl">
        {children}
      </h2>
      {sub && <span className="text-sm font-semibold text-gray-400">{sub}</span>}
    </div>
  );
}

function ProgressBar({ current, target }: { current: number; target: number }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <div className="mt-2 w-full">
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-right text-xs font-semibold text-gray-400">
        {current}/{target}
      </div>
    </div>
  );
}

function ProfilePage() {
  const router = useRouter();
  const params = useSearchParams();
  const userId = params.get("user");
  const [data, setData] = useState<RewardsData | null>(null);
  const [user, setUser] = useState<UserView | null>(null);
  const [users, setUsers] = useState<UserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("collectibles");

  const load = useCallback(() => {
    if (!userId) return;
    fetch(`/api/rewards?user=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      router.push("/");
      return;
    }
    fetch("/api/users")
      .then((r) => r.json())
      .then((list: UserView[]) => {
        setUsers(list);
        setUser(list.find((u) => u.id === userId) || null);
      })
      .catch(() => {});
    load();
  }, [userId, router, load]);

  // Save a collectible to the device gallery. On iPad/iOS the Web Share API
  // opens the share sheet with "Save Image"; elsewhere we fall back to opening
  // the image so it can be long-pressed / right-clicked to save.
  const saveCollectible = async (c: CollectibleView) => {
    const url = c.image;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], `${c.id}.png`, {
        type: blob.type || "image/png",
      });
      const nav = navigator as Navigator & {
        canShare?: (d?: ShareData) => boolean;
      };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({
          files: [file],
          title: c.name,
          text: `${c.name} — Dolls 2026`,
        });
        return;
      }
    } catch {
      // user cancelled the share sheet, or fetch/share unsupported — fall back
    }
    window.open(url, "_blank");
  };

  const toggleRedeem = async (rowId: number, currentlyRedeemed: boolean) => {
    await fetch("/api/rewards/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowId, redeemed: !currentlyRedeemed }),
    });
    load();
  };

  if (loading || !data || !Array.isArray(data.badges)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-6xl">👤</div>
          <p className="text-xl text-gray-600">
            {loading || !data ? "Loading profile..." : "Couldn't load profile."}
          </p>
          {!loading && data && !Array.isArray(data.badges) && (
            <button
              onClick={() => router.push(`/?user=${userId}`)}
              className="mt-4 rounded-full bg-indigo-600 px-6 py-2 text-sm font-semibold text-white"
            >
              ← Back
            </button>
          )}
        </div>
      </div>
    );
  }

  const color = user?.color || "#4F39F6";
  const nameOf = (id: string | null) =>
    id ? (users.find((u) => u.id === id)?.name ?? id) : "";
  const earnedBadges = data.badges.filter((b) => b.earned).length;
  const myFigures = data.collectibles.filter((c) => c.ownerId === userId).length;
  const familyFigures = data.collectibles.filter((c) => c.ownerId).length;
  const unredeemedTickets = data.tickets.filter((t) => t.status !== "redeemed").length;
  // Avatar: a figure this girl owns, else her initial.
  const featured = data.collectibles.find((c) => c.ownerId === userId);

  return (
    <div className="min-h-screen">
      {/* Profile header */}
      <header style={{ backgroundColor: color }} className="px-6 pt-8 pb-14 md:px-10">
        <button
          onClick={() => router.push(`/?user=${userId}`)}
          className="mb-6 flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/30"
        >
          ← Back
        </button>
        <div className="flex items-center gap-5">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white/20 shadow-lg ring-4 ring-white/40 md:h-28 md:w-28">
            {featured ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={featured.image}
                alt={featured.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-5xl font-black text-white">
                {user?.name?.[0] ?? "?"}
              </span>
            )}
          </div>
          <div className="text-white">
            <h1 className="text-4xl font-black md:text-5xl">
              {user?.name || "Profile"}
            </h1>
            {user && (
              <p className="text-sm font-semibold text-white/80">
                Grade {user.grade} · 🏆 {RULES.season.name}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-white/20 px-3 py-1.5">
                🔥 {data.stats.currentStreak}-day streak
              </span>
              <span className="rounded-full bg-white/20 px-3 py-1.5">
                🎫 {unredeemedTickets}
              </span>
              <span className="rounded-full bg-white/30 px-3 py-1.5">
                💰 ${data.dollars.toFixed(2)} earned
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto -mt-6 max-w-6xl rounded-t-3xl bg-[#f0f4ff] p-6 md:p-10">
        {/* Section pill menu */}
        <nav className="sticky top-3 z-20 mx-auto mb-8 flex w-fit max-w-full flex-nowrap justify-center gap-1 overflow-x-auto rounded-full bg-white/80 p-1.5 shadow-md backdrop-blur">
          {(
            [
              ["collectibles", `🧸 Dolls`, familyFigures],
              ["tickets", `🎫 Tickets`, data.tickets.length],
              ["badges", `🏅 Badges`, earnedBadges],
              ["family", `🏠 Family`, null],
              ["how", `❓ Rules`, null],
            ] as [TabId, string, number | null][]
          ).map(([id, label, count]) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={active ? { backgroundColor: color } : undefined}
                className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 text-xs font-bold transition-all sm:gap-1.5 sm:px-4 sm:text-sm ${
                  active ? "text-white shadow" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {label}
                {count !== null && (
                  <span
                    className={`rounded-full px-1.5 text-xs ${active ? "bg-white/25" : "bg-gray-200 text-gray-500"}`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Collectibles */}
        {tab === "collectibles" && (
        <section>
          <SectionTitle
            sub={`${familyFigures}/${data.deckSize} found by the sisters · ${myFigures} in your collection`}
          >
            🧸 {data.collectibleSet}
          </SectionTitle>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            {[...data.collectibles]
              .sort((a, b) => {
                // Owned first, most-recently collected first; unfound last.
                if (!!a.earnedAt !== !!b.earnedAt) return a.earnedAt ? -1 : 1;
                if (a.earnedAt && b.earnedAt)
                  return b.earnedAt.localeCompare(a.earnedAt);
                return 0;
              })
              .map((c) => {
              const owned = c.ownerId !== null;
              const mine = c.ownerId === userId;
              const ownerColor =
                users.find((u) => u.id === c.ownerId)?.color || "#9ca3af";
              return (
                <div
                  key={c.id}
                  className="overflow-hidden rounded-2xl bg-white shadow-sm transition-transform hover:scale-[1.03]"
                  style={owned ? { boxShadow: `0 0 0 3px ${ownerColor}` } : undefined}
                  title={owned ? `${c.girl}'s ${c.name}` : "Not found yet"}
                >
                  <div className="relative aspect-square bg-gray-50">
                    {owned ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.image}
                        alt={c.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gray-100">
                        <span className="text-4xl opacity-25 grayscale">{c.icon}</span>
                        <span className="text-xs font-bold text-gray-300">???</span>
                      </div>
                    )}
                    {owned && (
                      <span
                        className="absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow"
                        style={{ backgroundColor: ownerColor }}
                      >
                        {mine ? "You" : nameOf(c.ownerId)}
                      </span>
                    )}
                    {mine && (
                      <button
                        onClick={() => saveCollectible(c)}
                        aria-label={`Save ${c.name} to photos`}
                        className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1.5 text-xs font-bold text-white backdrop-blur transition hover:bg-black/75 active:scale-90"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="14"
                          height="14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 15V3" />
                          <path d="M8 7l4-4 4 4" />
                          <path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
                        </svg>
                        Save
                      </button>
                    )}
                  </div>
                  <div className="px-4 py-3">
                    <span
                      className={`block truncate text-base font-bold capitalize ${owned ? "text-gray-800" : "text-gray-300"}`}
                    >
                      {owned ? `${c.girl}'s ${c.name}` : "Not found"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        )}

        {/* Golden Tickets */}
        {tab === "tickets" && (
        <section>
          <SectionTitle>🎫 Golden Tickets</SectionTitle>
          {data.tickets.length === 0 ? (
            <p className="text-gray-500">
              No tickets yet — perfect scores and big milestones can win a
              real-world reward!
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {data.tickets.map((t) => {
                const redeemed = t.status === "redeemed";
                return (
                  <div
                    key={t.rowId}
                    className={`flex items-center gap-4 rounded-2xl p-4 shadow-md ${
                      redeemed
                        ? "bg-gray-100 opacity-60"
                        : "bg-gradient-to-r from-amber-400 to-yellow-300"
                    }`}
                  >
                    <span className="text-4xl">{t.icon}</span>
                    <div className="flex-1 text-left">
                      <div
                        className={`text-lg font-black ${redeemed ? "text-gray-500 line-through" : "text-amber-950"}`}
                      >
                        {t.name}
                      </div>
                      <div
                        className={`text-sm font-medium ${redeemed ? "text-gray-400" : "text-amber-900/90"}`}
                      >
                        {t.description}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleRedeem(t.rowId, redeemed)}
                      className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                        redeemed
                          ? "bg-gray-200 text-gray-600 hover:bg-gray-300"
                          : "bg-amber-950 text-white hover:bg-amber-900"
                      }`}
                    >
                      {redeemed ? "Undo" : "Redeem"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        )}

        {/* Badges */}
        {tab === "badges" && (
        <section>
          <SectionTitle sub={`${earnedBadges}/${data.badges.length} earned`}>
            🏅 Badges
          </SectionTitle>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.badges.map((b) => (
              <div
                key={b.id}
                className={`flex items-start gap-3 rounded-2xl p-4 shadow-sm ${
                  b.earned ? "bg-white" : "bg-gray-100"
                }`}
                style={
                  b.earned
                    ? { boxShadow: `0 0 0 2px ${RARITY_META[b.rarity].glow}` }
                    : undefined
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={badgeImage(b.id)}
                  alt={b.name}
                  loading="lazy"
                  className={`h-16 w-16 shrink-0 object-contain ${b.earned ? "" : "opacity-30 grayscale"}`}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-black ${b.earned ? "text-gray-800" : "text-gray-400"}`}
                    >
                      {b.name}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white"
                      style={{ backgroundColor: RARITY_META[b.rarity].color }}
                    >
                      {RARITY_META[b.rarity].label}
                    </span>
                  </div>
                  <div className={`text-sm ${b.earned ? "text-gray-500" : "text-gray-400"}`}>
                    {b.description}
                  </div>
                  {!b.earned && b.progress && b.progress.target > 1 && (
                    <ProgressBar current={b.progress.current} target={b.progress.target} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
        )}

        {/* Family goals */}
        {tab === "family" && (
        <section>
          <SectionTitle>🏠 Family Goals</SectionTitle>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {data.familyGoals.map((g) => (
              <div
                key={g.id}
                className={`rounded-2xl p-5 shadow-sm ${
                  g.completed
                    ? "bg-gradient-to-br from-pink-400 to-rose-300 text-white"
                    : "bg-white"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-3xl">{g.icon}</span>
                  <span className={`font-black ${g.completed ? "text-white" : "text-gray-800"}`}>
                    {g.name}
                  </span>
                </div>
                <div className={`mt-1 text-sm ${g.completed ? "text-white/90" : "text-gray-500"}`}>
                  {g.description}
                </div>
                <div
                  className={`mt-2 text-sm font-bold ${g.completed ? "text-white" : "text-rose-500"}`}
                >
                  🎁 {g.reward}
                </div>
                {g.completed ? (
                  <div className="mt-2 text-xs font-black uppercase tracking-wide text-white">
                    ✓ Unlocked!
                  </div>
                ) : (
                  <ProgressBar current={g.current} target={g.target} />
                )}
              </div>
            ))}
          </div>
        </section>
        )}

        {/* How it works (ELI5) */}
        {tab === "how" && (
          <section>
            <SectionTitle>❓ The Rules</SectionTitle>
            <HowItWorks />
          </section>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-6xl">👤</div>
        </div>
      }
    >
      <ProfilePage />
    </Suspense>
  );
}
