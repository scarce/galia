"use client";

import { useMemo, useState } from "react";
import { RARITY_META, badgeImage, type EarnedRewards } from "@/lib/rewards";
import { RULES } from "@/lib/reward-rules";
import ScratchReveal from "./ScratchReveal";

export function hasRewards(r: EarnedRewards | null | undefined): boolean {
  if (!r) return false;
  return (
    r.badges.length > 0 ||
    r.collectible !== null ||
    r.tickets.length > 0 ||
    r.familyGoals.length > 0
  );
}

const CONFETTI = ["🎉", "⭐", "✨", "🎊", "💫", "🌟", "🎈", "🥳"];

export default function RewardPopup({
  rewards,
  userName,
  onClose,
}: {
  rewards: EarnedRewards;
  userName: string;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [forceReveal, setForceReveal] = useState(false);
  // If there's no figure to scratch, treat as already revealed.
  const [revealed, setRevealed] = useState(!rewards.collectible);

  const confetti = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: (i * 53) % 100,
        delay: (i % 12) * 0.18,
        dur: 2.2 + (i % 6) * 0.45,
        emoji: CONFETTI[i % CONFETTI.length],
        size: 18 + (i % 4) * 7,
      })),
    [],
  );

  const c = rewards.collectible;
  const headline = !revealed
    ? "A surprise!"
    : rewards.tickets.length
      ? "JACKPOT!"
      : rewards.familyGoals.length
        ? "FAMILY WIN!"
        : c?.rarity === "legendary"
          ? "LEGENDARY!!"
          : c?.rarity === "epic"
            ? "EPIC!"
            : c
              ? "NEW FIGURE!"
              : rewards.badges.length
                ? "AWESOME!"
                : "WOO-HOO!";

  const dollars = rewards.pointsEarned * RULES.redemption.dollarsPerPoint;

  // "Props" overlaid in the corner: tickets, badges, family goals.
  const props: { icon: string; img?: string; label: string; bg: string }[] = [
    ...rewards.tickets.map((t) => ({
      icon: t.icon,
      label: t.name,
      bg: "bg-amber-100 text-amber-800",
    })),
    ...rewards.badges.map((b) => ({
      icon: b.icon,
      img: badgeImage(b.id),
      label: b.name,
      bg: "bg-white text-gray-700",
    })),
    ...rewards.familyGoals.map((g) => ({
      icon: g.icon,
      label: g.name,
      bg: "bg-rose-100 text-rose-800",
    })),
  ];

  if (!open) return null;
  const close = () => {
    setOpen(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={close} />

      {/* Confetti */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {confetti.map((cf, i) => (
          <span
            key={i}
            className="reward-confetti absolute -top-10"
            style={{
              left: `${cf.left}%`,
              fontSize: `${cf.size}px`,
              animationDelay: `${cf.delay}s`,
              animationDuration: `${cf.dur}s`,
            }}
          >
            {cf.emoji}
          </span>
        ))}
      </div>

      <div className="party-pop relative z-10 w-full max-w-lg rounded-[2rem] bg-gradient-to-br from-fuchsia-500 via-violet-500 to-indigo-500 p-1.5 shadow-2xl">
        <div className="relative max-h-[88vh] overflow-y-auto rounded-[1.7rem] bg-white px-5 py-7 text-center md:px-8">
          <h2 className="party-wobble font-party bg-gradient-to-r from-pink-500 via-fuchsia-500 to-indigo-500 bg-clip-text text-5xl tracking-wide text-transparent md:text-6xl">
            {headline}
          </h2>
          <p className="font-party mt-1 text-xl text-gray-500">
            Great job, {userName}!
          </p>

          {rewards.pointsEarned > 0 && (
            <div className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-amber-700">
              <span className="font-party text-2xl">+{rewards.pointsEarned}</span>
              <span className="text-sm font-bold">
                points · ≈ ${dollars.toFixed(2)} for {RULES.season.name} 💰
              </span>
            </div>
          )}

          {/* Collectible: scratch-to-reveal gift */}
          {c && (
            <div className="mt-5 flex flex-col items-center">
              <ScratchReveal
                size={260}
                forceReveal={forceReveal}
                onReveal={() => setRevealed(true)}
              >
                <div className="party-bob flex h-full w-full items-center justify-center bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.image}
                    alt={c.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              </ScratchReveal>

              {!revealed ? (
                <button
                  onClick={() => setForceReveal(true)}
                  className="font-party mt-3 self-end rounded-full bg-fuchsia-100 px-5 py-2 text-lg text-fuchsia-700 shadow transition-transform hover:scale-105 active:scale-95"
                >
                  Reveal ✨
                </button>
              ) : (
                <div className="mt-3 text-center">
                  <span
                    className="font-party rounded-full px-3 py-0.5 text-xs uppercase tracking-wider text-white"
                    style={{ backgroundColor: RARITY_META[c.rarity].color }}
                  >
                    NEW! {RARITY_META[c.rarity].label}
                  </span>
                  <div className="font-party mt-1 text-2xl capitalize text-gray-800">
                    {c.figureGirl}&apos;s {c.name}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Other rewards earned this quiz */}
          {props.length > 0 && (
            <div className="mt-5 flex flex-col items-center gap-2">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Also earned
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {props.map((p, i) => (
                  <div
                    key={i}
                    className={`reward-row flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold shadow ${p.bg}`}
                    style={{ animationDelay: `${0.3 + i * 0.12}s` }}
                  >
                  {p.img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.img}
                      alt={p.label}
                      className="-my-0.5 h-6 w-6 object-contain"
                    />
                  ) : (
                    <span className="text-base">{p.icon}</span>
                  )}
                  <span>{p.label}</span>
                </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={close}
            className="font-party mx-auto mt-6 block rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-12 py-4 text-2xl text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
          >
            YAY! 🎉
          </button>
        </div>
      </div>
    </div>
  );
}
