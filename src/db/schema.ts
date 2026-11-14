import { pgTable, uuid, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  password: text("password").notNull(),
  role: text("role").default("case_worker"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const cases = pgTable("cases", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseNumber: text("case_number").notNull().unique(),
  title: text("title").notNull(),
  clientName: text("client_name").notNull(),
  caseType: text("case_type").notNull(),
  status: text("status").notNull().default("awaiting_review"),
  priority: text("priority").default("medium"),
  description: text("description"),
  assignedTo: text("assigned_to"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").references(() => cases.id),
  name: text("name").notNull(),
  type: text("type").notNull(),
  size: integer("size").default(0),
  status: text("status").default("uploaded"),
  extractedText: text("extracted_text"),
  source: text("source").default("Upload"),
  pageCount: integer("page_count").default(1),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const extractions = pgTable("extractions", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").references(() => cases.id),
  documentId: uuid("document_id").references(() => documents.id),
  fieldName: text("field_name").notNull(),
  fieldValue: text("field_value").notNull(),
  confidence: integer("confidence").default(80),
  sourceDoc: text("source_doc"),
  sourcePage: integer("source_page").default(1),
  sourceSnippet: text("source_snippet"),
  category: text("category").default("fact"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const recommendations = pgTable("recommendations", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").references(() => cases.id),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  reasoning: text("reasoning").notNull(),
  confidence: integer("confidence").default(70),
  status: text("status").default("pending"),
  evidence: jsonb("evidence").default([]),
  missingInfo: jsonb("missing_info").default([]),
  uncertainties: jsonb("uncertainties").default([]),
  nextSteps: jsonb("next_steps").default([]),
  reviewedBy: text("reviewed_by"),
  reviewComment: text("review_comment"),
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").references(() => cases.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  category: text("category").default("general"),
  timestamp: timestamp("timestamp").defaultNow(),
});
