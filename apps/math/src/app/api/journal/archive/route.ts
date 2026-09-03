import { NextRequest, NextResponse } from "next/server";
import { ensureJournalTable, toggleArchive } from "@/lib/journal";

export async function POST(request: NextRequest) {
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 500 },
    );
  }

  try {
    const { id, archived } = await request.json();
    if (typeof id !== "number" || typeof archived !== "boolean") {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 },
      );
    }

    await ensureJournalTable();
    await toggleArchive(id, archived);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Archive toggle error:", error);
    return NextResponse.json(
      { error: "Failed to update entry" },
      { status: 500 },
    );
  }
}
