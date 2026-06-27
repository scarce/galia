import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

// GET: Retrieve lesson by session_id
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  try {
    const result = await sql`
      SELECT session_id, lesson_text, lesson_audio_base64, created_at
      FROM lessons
      WHERE session_id = ${sessionId}
    `;

    if (result.rows.length === 0) {
      return NextResponse.json({ found: false });
    }

    const lesson = result.rows[0];
    return NextResponse.json({
      found: true,
      lessonText: lesson.lesson_text,
      lessonAudioBase64: lesson.lesson_audio_base64,
      createdAt: lesson.created_at,
    });
  } catch (error) {
    console.error("Error fetching lesson:", error);
    return NextResponse.json({ error: "Failed to fetch lesson" }, { status: 500 });
  }
}

// POST: Save a new lesson
export async function POST(request: NextRequest) {
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { sessionId, userId, userName, themeName, grade, lessonText, lessonAudioBase64 } = body;

    if (!sessionId || !lessonText) {
      return NextResponse.json({ error: "sessionId and lessonText required" }, { status: 400 });
    }

    // Upsert: insert or update if exists
    await sql`
      INSERT INTO lessons (session_id, user_id, user_name, theme_name, grade, lesson_text, lesson_audio_base64)
      VALUES (${sessionId}, ${userId || ''}, ${userName || ''}, ${themeName || ''}, ${grade || 5}, ${lessonText}, ${lessonAudioBase64 || null})
      ON CONFLICT (session_id)
      DO UPDATE SET
        lesson_text = ${lessonText},
        lesson_audio_base64 = ${lessonAudioBase64 || null}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving lesson:", error);
    return NextResponse.json({ error: "Failed to save lesson" }, { status: 500 });
  }
}
