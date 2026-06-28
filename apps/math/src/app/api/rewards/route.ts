import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import {
  BADGES,
  FIGURES,
  FAMILY_DECK_SIZE,
  COLLECTIBLE_SET,
  TICKETS_BY_ID,
  FAMILY_GOALS,
  EMPTY_STATS,
  evaluateBadges,
  type UserStats,
} from "@/lib/rewards";
import {
  computeStats,
  getFamilyMetrics,
  getPoints,
  ensureTables,
} from "@/lib/award";

const buildBadges = (stats: UserStats, earned: Set<string>) =>
  BADGES.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    icon: b.icon,
    rarity: b.rarity,
    earned: earned.has(b.id),
    progress: b.progress ? b.progress(stats) : null,
  }));

// A fully-locked, zeroed trophy room — used for no-DB (local) and as a safe
// fallback when a DB read fails, so the client never crashes.
function emptyPayload() {
  return {
    stats: EMPTY_STATS,
    points: 0,
    dollars: 0,
    badges: buildBadges(EMPTY_STATS, new Set()),
    collectibles: FIGURES.map((f) => ({
      id: f.id,
      name: f.name,
      icon: f.icon,
      rarity: f.rarity,
      girl: f.girl,
      image: f.image,
      ownerId: null as string | null,
      earnedAt: null as string | null,
    })),
    deckSize: FAMILY_DECK_SIZE,
    collectibleSet: COLLECTIBLE_SET,
    tickets: [] as unknown[],
    familyGoals: FAMILY_GOALS.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      icon: g.icon,
      reward: g.reward,
      target: g.target,
      current: 0,
      completed: false,
    })),
  };
}

// Everything the trophy room needs for one user: stats, badge wall (earned +
// locked with progress), collection album, won tickets, and family goals.
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user");
  if (!userId) {
    return NextResponse.json({ error: "Missing user" }, { status: 400 });
  }

  if (!process.env.POSTGRES_URL) {
    return NextResponse.json(emptyPayload());
  }

  try {
    await ensureTables(); // create reward tables on first read if missing
    const stats = await computeStats(userId);
    const { points, dollars } = await getPoints(userId);

    const badgeRows = await sql`
      SELECT badge_id FROM user_badges WHERE user_id = ${userId}
    `;
    const stored = new Set(badgeRows.rows.map((r) => r.badge_id as string));
    // Reconcile user_badges with the season-scoped truth. `stats` already counts
    // only this season's activity, so the badges the child actually qualifies for
    // are exactly evaluateBadges(stats). We INSERT any newly-earned ones (covers
    // seeded history that never ran awardRewards) and DELETE any stale rows that
    // no longer hold — e.g. badges left over from all-time stats before the
    // season window existed. Every badge criterion is monotonic within a season,
    // so this never churns a legitimately-earned badge.
    const satisfied = new Set(evaluateBadges(stats));
    for (const id of satisfied) {
      if (stored.has(id)) continue;
      await sql`
        INSERT INTO user_badges (user_id, badge_id)
        VALUES (${userId}, ${id})
        ON CONFLICT (user_id, badge_id) DO NOTHING
      `;
    }
    for (const id of stored) {
      if (satisfied.has(id)) continue;
      await sql`
        DELETE FROM user_badges WHERE user_id = ${userId} AND badge_id = ${id}
      `;
    }
    const earned = satisfied;

    // Shared family deck: who owns each figure (across all girls) + when.
    const collRows = await sql`
      SELECT user_id, collectible_id, earned_at FROM user_collectibles
    `;
    const ownerOf = new Map<string, { userId: string; earnedAt: string }>(
      collRows.rows.map((r) => [
        r.collectible_id as string,
        { userId: r.user_id as string, earnedAt: r.earned_at as string },
      ]),
    );

    const ticketRows = await sql`
      SELECT id, ticket_id, status, won_at, redeemed_at
      FROM user_tickets WHERE user_id = ${userId}
      ORDER BY won_at DESC
    `;
    const tickets = ticketRows.rows
      .map((r) => {
        const def = TICKETS_BY_ID[r.ticket_id as string];
        if (!def) return null;
        return {
          rowId: r.id as number,
          id: def.id,
          name: def.name,
          icon: def.icon,
          description: def.description,
          status: r.status as string,
          wonAt: r.won_at,
          redeemedAt: r.redeemed_at,
        };
      })
      .filter(Boolean);

    const completedRows = await sql`SELECT goal_id FROM family_milestones`;
    const completedGoals = new Set(
      completedRows.rows.map((r) => r.goal_id as string),
    );
    const metrics = await getFamilyMetrics();

    return NextResponse.json({
      stats,
      points,
      dollars,
      badges: buildBadges(stats, earned),
      collectibles: FIGURES.map((f) => ({
        id: f.id,
        name: f.name,
        icon: f.icon,
        rarity: f.rarity,
        girl: f.girl,
        image: f.image,
        ownerId: ownerOf.get(f.id)?.userId ?? null,
        earnedAt: ownerOf.get(f.id)?.earnedAt ?? null,
      })),
      deckSize: FAMILY_DECK_SIZE,
      collectibleSet: COLLECTIBLE_SET,
      tickets,
      familyGoals: FAMILY_GOALS.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        icon: g.icon,
        reward: g.reward,
        target: g.target,
        current: metrics[g.metric] ?? 0,
        completed: completedGoals.has(g.id),
      })),
    });
  } catch (error) {
    // Never 500 the client (it would crash the profile). Degrade to an empty
    // trophy room; a schema migration may be needed (see migrations/).
    console.error("Rewards read error:", error);
    return NextResponse.json(emptyPayload());
  }
}
