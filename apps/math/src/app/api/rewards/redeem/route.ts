import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// Mark a Golden Ticket as redeemed (toggle), once it's been honoured IRL.
export async function POST(request: NextRequest) {
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  try {
    const { rowId, redeemed } = await request.json();
    if (typeof rowId !== "number") {
      return NextResponse.json({ error: "Missing rowId" }, { status: 400 });
    }

    if (redeemed === false) {
      await sql`UPDATE user_tickets SET status = 'unredeemed', redeemed_at = NULL WHERE id = ${rowId}`;
    } else {
      await sql`UPDATE user_tickets SET status = 'redeemed', redeemed_at = NOW() WHERE id = ${rowId}`;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Ticket redeem error:", error);
    return NextResponse.json({ error: "Failed to update ticket" }, { status: 500 });
  }
}
