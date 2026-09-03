import { NextRequest, NextResponse } from "next/server";
import { ensureJournalTable, deleteEntry } from "@/lib/journal";

export async function POST(request: NextRequest) {
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 500 },
    );
  }

  try {
    const { id } = await request.json();
    if (typeof id !== "number") {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 },
      );
    }

    await ensureJournalTable();
    await deleteEntry(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete entry" },
      { status: 500 },
    );
  }
}
