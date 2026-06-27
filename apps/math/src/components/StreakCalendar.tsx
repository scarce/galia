"use client";

import { useEffect, useMemo, useState } from "react";

interface StreakDay {
  date: string; // YYYY-MM-DD
  timeSeconds: number;
  correct: number;
  total: number;
}

interface StreakCalendarProps {
  userId: string;
}

const WEEKS = 4;
const DAYS = WEEKS * 7;

// Ring colors (Apple Fitness vibe): red = time goal, yellow = correctness.
const RED = "#ff375f";
const RED_TRACK = "rgba(255, 55, 95, 0.25)";
const YELLOW = "#ffd60a";
const YELLOW_TRACK = "rgba(255, 214, 10, 0.25)";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface Cell {
  date: Date;
  iso: string;
  isFuture: boolean;
  isToday: boolean;
  timeSeconds: number;
  correct: number;
  total: number;
}

// One day = two concentric rings drawn with SVG.
function DayRings({
  timeFrac,
  correctFrac,
  dim,
}: {
  timeFrac: number;
  correctFrac: number;
  dim: boolean;
}) {
  const size = 44;
  const center = size / 2;
  const stroke = 5;
  const gap = 2.5;
  const rOuter = center - stroke / 2 - 1;
  const rInner = rOuter - stroke - gap;
  const cOuter = 2 * Math.PI * rOuter;
  const cInner = 2 * Math.PI * rInner;

  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const tf = clamp(timeFrac);
  const cf = clamp(correctFrac);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: "rotate(-90deg)" }}
      className={dim ? "opacity-30" : ""}
    >
      {/* Outer track + time progress */}
      <circle
        cx={center}
        cy={center}
        r={rOuter}
        fill="none"
        stroke={RED_TRACK}
        strokeWidth={stroke}
      />
      <circle
        cx={center}
        cy={center}
        r={rOuter}
        fill="none"
        stroke={RED}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={cOuter}
        strokeDashoffset={cOuter * (1 - tf)}
      />
      {/* Inner track + correctness progress */}
      <circle
        cx={center}
        cy={center}
        r={rInner}
        fill="none"
        stroke={YELLOW_TRACK}
        strokeWidth={stroke}
      />
      <circle
        cx={center}
        cy={center}
        r={rInner}
        fill="none"
        stroke={YELLOW}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={cInner}
        strokeDashoffset={cInner * (1 - cf)}
      />
    </svg>
  );
}

export default function StreakCalendar({ userId }: StreakCalendarProps) {
  const [days, setDays] = useState<StreakDay[]>([]);
  const [goalSeconds, setGoalSeconds] = useState(30 * 60);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/streak?user=${encodeURIComponent(userId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        setDays(data.days || []);
        if (data.goalSeconds) setGoalSeconds(data.goalSeconds);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const byDate = useMemo(() => {
    const map = new Map<string, StreakDay>();
    for (const d of days) map.set(d.date, d);
    return map;
  }, [days]);

  // Build a 4-week grid aligned to Mon..Sun columns, ending with the current week.
  const cells = useMemo<Cell[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = toLocalISO(today);
    // JS getDay(): Sun=0..Sat=6 -> convert to Mon=0..Sun=6
    const mondayIndex = (today.getDay() + 6) % 7;
    const start = new Date(today);
    start.setDate(today.getDate() - mondayIndex - (WEEKS - 1) * 7);

    const out: Cell[] = [];
    for (let i = 0; i < DAYS; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const iso = toLocalISO(date);
      const data = byDate.get(iso);
      out.push({
        date,
        iso,
        isFuture: date > today,
        isToday: iso === todayIso,
        timeSeconds: data?.timeSeconds ?? 0,
        correct: data?.correct ?? 0,
        total: data?.total ?? 0,
      });
    }
    return out;
  }, [byDate]);

  // A day "counts" toward the streak when both rings are full:
  const monthLabel = useMemo(() => {
    const today = new Date();
    return today.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }, []);

  return (
    <div className="w-full rounded-3xl bg-[#4F39F6] p-5 text-white md:p-6">
      <div className="mb-2 text-center text-sm font-bold text-white/80">
        {monthLabel}
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-white/40">
        {WEEKDAYS.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-2">
        {cells.map((c) => {
          const timeFrac = goalSeconds > 0 ? c.timeSeconds / goalSeconds : 0;
          const correctFrac = c.total > 0 ? c.correct / c.total : 0;
          const hasActivity = c.total > 0 || c.timeSeconds > 0;
          return (
            <div
              key={c.iso}
              className="flex flex-col items-center gap-0.5"
              title={
                hasActivity
                  ? `${c.iso}: ${Math.round(
                      c.timeSeconds / 60,
                    )} min, ${c.correct}/${c.total} correct`
                  : c.iso
              }
            >
              <div className="relative">
                <DayRings
                  timeFrac={loading ? 0 : timeFrac}
                  correctFrac={loading ? 0 : correctFrac}
                  dim={c.isFuture || (!hasActivity && !c.isToday)}
                />
                {c.isToday && (
                  <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/30" />
                )}
              </div>
              <span
                className={`text-[10px] tabular-nums ${
                  c.isToday
                    ? "font-bold text-white"
                    : c.isFuture
                      ? "text-white/25"
                      : "text-white/55"
                }`}
              >
                {c.date.getDate()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
