PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT PRIMARY KEY,
  created_at     INTEGER NOT NULL,
  original_query TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active',  -- active | frozen
  round          INTEGER NOT NULL DEFAULT 0,
  frozen_at      INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round      INTEGER NOT NULL,
  role       TEXT NOT NULL,                        -- recruiter | assistant | system
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);

CREATE TABLE IF NOT EXISTS criteria_versions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round        INTEGER NOT NULL,
  filters_json TEXT NOT NULL,
  rubric_json  TEXT NOT NULL,
  changes_json TEXT NOT NULL DEFAULT '[]',
  source       TEXT NOT NULL,                      -- extracted | refined | edited
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_criteria_session ON criteria_versions(session_id, round);

CREATE TABLE IF NOT EXISTS verdicts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round      INTEGER NOT NULL,
  profile_id TEXT NOT NULL,
  verdict    TEXT NOT NULL,                        -- match | reject
  note       TEXT,
  source     TEXT NOT NULL,                        -- chat | button
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verdicts_session ON verdicts(session_id, id);

CREATE TABLE IF NOT EXISTS summaries (
  session_id            TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  text                  TEXT NOT NULL,
  covers_through_msg_id INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

-- Results per round, so reopening a past search costs nothing. Without this,
-- resuming would mean re-running every scoring call against the LLM.
CREATE TABLE IF NOT EXISTS results (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round         INTEGER NOT NULL,
  profile_id    TEXT NOT NULL,
  position      INTEGER NOT NULL,
  score         INTEGER,
  verdict       TEXT,
  rationale     TEXT,
  evidence_json TEXT,
  concerns_json TEXT,
  unverified    INTEGER NOT NULL DEFAULT 0,
  relaxations_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(session_id, round, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_results_session ON results(session_id, round);
