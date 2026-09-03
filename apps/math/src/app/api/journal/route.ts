import { NextRequest, NextResponse } from "next/server";
import { ensureJournalTable, getEntries, createEntry } from "@/lib/journal";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user");
  if (!userId) {
    return NextResponse.json({ error: "Missing user" }, { status: 400 });
  }

  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ entries: [] });
  }

  try {
    await ensureJournalTable();
    const entries = await getEntries(userId);
    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Journal read error:", error);
    return NextResponse.json({ entries: [] });
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 500 },
    );
  }

  try {
    const { userId, topicCategory, topic, content } = await request.json();
    if (!userId || !topicCategory || !topic || !content) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    await ensureJournalTable();
    const entry = await createEntry(userId, topicCategory, topic, content);
    return NextResponse.json({ entry, success: true });
  } catch (error) {
    console.error("Journal create error:", error);
    return NextResponse.json(
      { error: "Failed to create entry" },
      { status: 500 },
    );
  }
}
