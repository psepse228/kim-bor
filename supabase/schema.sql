-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
-- Note: OTPs are stored in memory (notifier.js otpStore), not in the DB
CREATE TABLE users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_username   TEXT UNIQUE NOT NULL,
  telegram_chat_id     TEXT,
  check_interval_hours INT DEFAULT 3,
  is_verified          BOOLEAN DEFAULT false,
  pending_follow       BOOLEAN DEFAULT false,
  invite_code_used     TEXT,
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- Snapshots table
CREATE TABLE snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  taken_at        TIMESTAMPTZ DEFAULT now(),
  follower_count  INT,
  following_count INT,
  follower_list   JSONB,
  following_list  JSONB
);

CREATE INDEX idx_snapshots_user_id ON snapshots(user_id);
CREATE INDEX idx_snapshots_taken_at ON snapshots(taken_at DESC);

-- Events table
CREATE TABLE events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  detected_at      TIMESTAMPTZ DEFAULT now(),
  type             TEXT NOT NULL,
  target_username  TEXT,
  count_before     INT,
  count_after      INT
);

CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_detected_at ON events(detected_at DESC);

-- Constraint: type must be one of the four valid values
ALTER TABLE events ADD CONSTRAINT events_type_check
  CHECK (type IN ('unfollowed', 'new_follower', 'you_follow_no_return', 'they_follow_no_return'));
