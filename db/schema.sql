CREATE TABLE IF NOT EXISTS document_summaries (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  document_name TEXT NOT NULL,
  summary TEXT NOT NULL,
  highlights TEXT NOT NULL,
  engine TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_summaries_case ON document_summaries (case_id);