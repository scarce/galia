import { sql } from "@/lib/db";
import type { JournalEntry } from "@/lib/journal-prompts";

export async function ensureJournalTable() {
  // Create table if it doesn't exist
  await sql`CREATE TABLE IF NOT EXISTS journal_entries (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(10) NOT NULL,
    topic_category VARCHAR(50) NOT NULL,
    topic VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    archived BOOLEAN DEFAULT false,
    deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`;

  // Add topic_category column if it doesn't exist (migration for older tables)
  try {
    await sql`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS topic_category VARCHAR(50)`;
  } catch {
    // Column might already exist or other schema issue, continue
  }

  // Add archived column if it doesn't exist (migration for older tables)
  try {
    await sql`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false`;
  } catch {
    // Column might already exist or other schema issue, continue
  }

  // Add deleted column if it doesn't exist (migration for older tables)
  try {
    await sql`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false`;
  } catch {
    // Column might already exist or other schema issue, continue
  }
}

export async function createEntry(
  userId: string,
  topicCategory: string,
  topic: string,
  content: string,
): Promise<JournalEntry> {
  const result = await sql`
    INSERT INTO journal_entries (user_id, topic_category, topic, content)
    VALUES (${userId}, ${topicCategory}, ${topic}, ${content})
    RETURNING id, user_id, topic_category, topic, content, archived, deleted, created_at
  `;
  const row = result.rows[0];
  return {
    id: row.id as number,
    userId: row.user_id as string,
    topicCategory: row.topic_category as string,
    topic: row.topic as string,
    content: row.content as string,
    archived: row.archived as boolean,
    deleted: row.deleted as boolean,
    createdAt: row.created_at as string,
  };
}

export async function getEntries(userId: string): Promise<JournalEntry[]> {
  const result = await sql`
    SELECT id, user_id, topic_category, topic, content, archived, deleted, created_at
    FROM journal_entries
    WHERE user_id = ${userId} AND deleted = false
    ORDER BY created_at DESC
  `;
  return result.rows.map((row) => ({
    id: row.id as number,
    userId: row.user_id as string,
    topicCategory: row.topic_category as string,
    topic: row.topic as string,
    content: row.content as string,
    archived: row.archived as boolean,
    deleted: row.deleted as boolean,
    createdAt: row.created_at as string,
  }));
}

export async function getEntry(id: number): Promise<JournalEntry | null> {
  const result = await sql`
    SELECT id, user_id, topic_category, topic, content, archived, deleted, created_at
    FROM journal_entries
    WHERE id = ${id} AND deleted = false
  `;
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id as number,
    userId: row.user_id as string,
    topicCategory: row.topic_category as string,
    topic: row.topic as string,
    content: row.content as string,
    archived: row.archived as boolean,
    deleted: row.deleted as boolean,
    createdAt: row.created_at as string,
  };
}

export async function toggleArchive(id: number, archived: boolean): Promise<void> {
  await sql`
    UPDATE journal_entries
    SET archived = ${archived}
    WHERE id = ${id}
  `;
}

export async function deleteEntry(id: number): Promise<void> {
  await sql`
    UPDATE journal_entries
    SET deleted = true
    WHERE id = ${id}
  `;
}
