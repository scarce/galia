import { NextRequest, NextResponse } from "next/server";
import { ensureTables, recordSpend } from "@/lib/award";

// Cash out part of a child's earned balance. Records a note of what the money
// went towards and subtracts the amount from the available balance (the effort
// points that drive collectibles are left untouched).
export async function POST(request: NextRequest) {
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  try {
    const { userId, amount, note } = await request.json();
    if (typeof userId !== "string" || !userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }
    const value = Number(amount);
    if (!Number.isFinite(value)) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    await ensureTables();
    const result = await recordSpend(
      userId,
      value,
      typeof note === "string" ? note : "",
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      dollars: result.dollars,
      spent: result.spent,
    });
  } catch (error) {
    console.error("Spend error:", error);
    return NextResponse.json({ error: "Failed to record spend" }, { status: 500 });
  }
}
