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
  type UserStats,
} from "@/lib/rewards";
import { computeStats, getFamilyMetrics, getPoints } from "@/lib/award";

// Everything the trophy room needs for one user: stats, badge wall (earned +
// locked with progress), collection album, won tickets, and family goals.
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user");
  if (!userId) {
    return NextResponse.json({ error: "Missing user" }, { status: 400 });
  }

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

  // No DB (e.g. local dev): return a fully-locked, zeroed trophy room.
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({
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
        ownerId: null,
        earnedAt: null,
      })),
      deckSize: FAMILY_DECK_SIZE,
      collectibleSet: COLLECTIBLE_SET,
      tickets: [],
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
    });
  }

  try {
    const stats = await computeStats(userId);
    const { points, dollars } = await getPoints(userId);

    const badgeRows = await sql`
      SELECT badge_id FROM user_badges WHERE user_id = ${userId}
    `;
    const earned = new Set(badgeRows.rows.map((r) => r.badge_id as string));

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
    console.error("Rewards read error:", error);
    return NextResponse.json({ error: "Failed to load rewards" }, { status: 500 });
  }
}
