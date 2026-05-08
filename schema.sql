CREATE TABLE IF NOT EXISTS rooms (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(6) UNIQUE NOT NULL,
  state       VARCHAR(20) NOT NULL DEFAULT 'waiting',
  result_json TEXT,
  round_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT NOW()
);
-- Migration (run once if table already exists):
-- ALTER TABLE rooms ADD COLUMN IF NOT EXISTS round_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS players (
  id      SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name    VARCHAR(50) NOT NULL,
  token   VARCHAR(100),
  role    VARCHAR(20),
  score   INTEGER NOT NULL DEFAULT 0,
  joined_at TIMESTAMP DEFAULT NOW()
);
