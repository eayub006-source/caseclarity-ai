-- Cloudflare D1 schema for AI document summaries (database "caseclarity-summaries",
-- binding DB). This file documents the table; the Worker also creates/updates it
-- additively at runtime (src/lib/summaries-db.ts), so an existing database needs
-- no manual migration before a deploy.
--
-- What is stored: the AI summary of a document, its cited highlights, the
-- document id and name, the engine that wrote it and a server timestamp.
-- What is NOT stored: original files, extracted document text, case records,
-- account details or API keys.
--
-- workspace_id is the SHA-256 hash of the random workspace token kept in the
-- visitor's browser. Every query is scoped by it, so a case ID alone cannot
-- read or overwrite another visitor's summaries.
--
-- Rows written by the earlier, case-ID-scoped implementation have
-- workspace_id = NULL. They are preserved (never deleted or rewritten) but are
-- not returned to any visitor, because they cannot be attributed to one
-- workspace. To hand an old row to a known workspace, set workspace_id to the
-- value of `SELECT ... ` from that workspace's own rows — never guess it from
-- a case ID.

CREATE TABLE IF NOT EXISTS document_summaries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,           -- SHA-256 of the workspace token; NULL = legacy row
  case_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  document_name TEXT NOT NULL,
  summary TEXT NOT NULL,
  highlights TEXT NOT NULL,    -- JSON array of { text, page, verified }
  engine TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_summaries_case ON document_summaries (case_id);
CREATE INDEX IF NOT EXISTS idx_summaries_workspace_case ON document_summaries (workspace_id, case_id);
