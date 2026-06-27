-- One-time migration to bring an existing production DB up to the current
-- rewards schema. Idempotent — safe to run more than once.
--
-- Run it once against prod (e.g. `psql "$POSTGRES_URL" -f migrations/001_rewards_schema.sql`
-- or paste into the Neon/Vercel SQL console). Only needed if an EARLIER rewards
-- version was already deployed; a first-time deploy auto-creates everything via
-- ensureTables().

-- quiz_results: columns added for rounds / levels / test mode / sessions.
ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS round INTEGER DEFAULT 1;
ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS level VARCHAR(50);
ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS is_test_mode BOOLEAN DEFAULT FALSE;
ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS session_id VARCHAR(200);

-- New reward tables (no-ops if they already exist).
CREATE TABLE IF NOT EXISTS user_badges (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(10) NOT NULL,
  badge_id VARCHAR(50) NOT NULL,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS user_tickets (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(10) NOT NULL,
  user_name VARCHAR(50) NOT NULL,
  ticket_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'unredeemed',
  won_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  redeemed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS family_milestones (
  id SERIAL PRIMARY KEY,
  goal_id VARCHAR(50) NOT NULL UNIQUE,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_points (
  user_id VARCHAR(10) PRIMARY KEY,
  points INTEGER NOT NULL DEFAULT 0,
  collectibles_awarded INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- user_collectibles: migrate from the OLD per-girl shape (count +
-- UNIQUE(user_id, collectible_id)) to the shared-deck shape
-- (UNIQUE(collectible_id), no count). Creates fresh if absent.
CREATE TABLE IF NOT EXISTS user_collectibles (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(10) NOT NULL,
  collectible_id VARCHAR(60) NOT NULL,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE user_collectibles ADD COLUMN IF NOT EXISTS earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
-- drop legacy columns from the old per-girl shape
ALTER TABLE user_collectibles DROP COLUMN IF EXISTS count;
ALTER TABLE user_collectibles DROP COLUMN IF EXISTS first_earned_at;
ALTER TABLE user_collectibles DROP COLUMN IF EXISTS last_earned_at;

-- Drop the old composite unique, de-dupe any colliding figures (keep earliest),
-- then add the global unique the new award logic relies on.
ALTER TABLE user_collectibles DROP CONSTRAINT IF EXISTS user_collectibles_user_id_collectible_id_key;
DELETE FROM user_collectibles a USING user_collectibles b
  WHERE a.id > b.id AND a.collectible_id = b.collectible_id;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_collectibles_collectible_id_key'
  ) THEN
    ALTER TABLE user_collectibles
      ADD CONSTRAINT user_collectibles_collectible_id_key UNIQUE (collectible_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_collectibles_user_id ON user_collectibles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tickets_user_id ON user_tickets(user_id);
