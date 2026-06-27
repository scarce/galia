-- Run this SQL in your Vercel Postgres database to create the required table

CREATE TABLE IF NOT EXISTS quiz_results (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(10) NOT NULL,
  user_name VARCHAR(50) NOT NULL,
  theme_id VARCHAR(100) NOT NULL,
  theme_name VARCHAR(200) NOT NULL,
  score INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  total_time_seconds INTEGER NOT NULL,
  avg_time_per_question REAL NOT NULL,
  mistakes JSONB NOT NULL,
  all_answers JSONB NOT NULL,
  round INTEGER DEFAULT 1,
  level VARCHAR(50),
  is_test_mode BOOLEAN DEFAULT FALSE,
  session_id VARCHAR(200),
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries by user
CREATE INDEX IF NOT EXISTS idx_quiz_results_user_id ON quiz_results(user_id);

-- Index for faster queries by date
CREATE INDEX IF NOT EXISTS idx_quiz_results_completed_at ON quiz_results(completed_at);

-- Lessons table for storing AI-generated lessons between rounds
CREATE TABLE IF NOT EXISTS lessons (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(200) NOT NULL UNIQUE,
  user_id VARCHAR(10) NOT NULL,
  user_name VARCHAR(50) NOT NULL,
  theme_name VARCHAR(200) NOT NULL,
  grade INTEGER NOT NULL,
  lesson_text TEXT NOT NULL,
  lesson_audio_base64 TEXT,  -- Base64-encoded MP3 audio
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lesson lookups by session
CREATE INDEX IF NOT EXISTS idx_lessons_session_id ON lessons(session_id);

-- ===========================================================================
-- Rewards system: mastery badges, collectibles, Golden Tickets, family goals.
-- Reward *definitions* live in code (src/lib/rewards.ts); these tables only
-- track earned/won state per user.
-- ===========================================================================

-- Layer 1: earned mastery badges (one row per user per badge).
CREATE TABLE IF NOT EXISTS user_badges (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(10) NOT NULL,
  badge_id VARCHAR(50) NOT NULL,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);

-- Layer 2: shared family deck — each figure (collectible_id, e.g. "iris_doctor")
-- is won once family-wide and owned by one girl. UNIQUE on collectible_id.
CREATE TABLE IF NOT EXISTS user_collectibles (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(10) NOT NULL,
  collectible_id VARCHAR(60) NOT NULL UNIQUE,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_collectibles_user_id ON user_collectibles(user_id);

-- Layer 3: won Golden Tickets (experiential rewards), redeemed with a parent.
CREATE TABLE IF NOT EXISTS user_tickets (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(10) NOT NULL,
  user_name VARCHAR(50) NOT NULL,
  ticket_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'unredeemed',
  won_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  redeemed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_user_tickets_user_id ON user_tickets(user_id);

-- Cooperative family goals: one row per goal once completed (family-wide).
CREATE TABLE IF NOT EXISTS family_milestones (
  id SERIAL PRIMARY KEY,
  goal_id VARCHAR(50) NOT NULL UNIQUE,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cumulative effort points per user (points-mode collectibles + cash redemption).
CREATE TABLE IF NOT EXISTS user_points (
  user_id VARCHAR(10) PRIMARY KEY,
  points INTEGER NOT NULL DEFAULT 0,
  collectibles_awarded INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
