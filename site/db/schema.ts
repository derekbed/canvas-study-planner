import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const courses = sqliteTable("courses", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), canvasId: text("canvas_id"),
  name: text("name").notNull(), code: text("code").notNull().default(""), color: text("color").notNull().default("blue"), imageUrl: text("image_url").notNull().default(""),
  targetGrade: real("target_grade").notNull().default(90), currentGrade: real("current_grade"),
  gradeWeights: text("grade_weights").notNull().default("{}"), source: text("source").notNull().default("manual"),
  createdAt: text("created_at").notNull(),
}, t => [index("idx_courses_user").on(t.userId), uniqueIndex("idx_courses_canvas").on(t.userId, t.canvasId)]);

export const events = sqliteTable("events", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), courseId: text("course_id"), canvasId: text("canvas_id"),
  title: text("title").notNull(), description: text("description").notNull().default(""), dueAt: text("due_at").notNull(),
  kind: text("kind").notNull().default("assignment"), pointsPossible: real("points_possible"), pointsEarned: real("points_earned"),
  status: text("status").notNull().default("upcoming"), source: text("source").notNull().default("manual"),
  url: text("url"), estimatedMinutes: integer("estimated_minutes").notNull().default(60),
  gradeGroup: text("grade_group").notNull().default(""), createdAt: text("created_at").notNull(),
}, t => [index("idx_events_user_due").on(t.userId, t.dueAt), uniqueIndex("idx_events_canvas").on(t.userId, t.canvasId)]);

export const materials = sqliteTable("materials", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), courseId: text("course_id").notNull(),
  name: text("name").notNull(), kind: text("kind").notNull().default("notes"), mimeType: text("mime_type").notNull().default("text/plain"),
  r2Key: text("r2_key"), extractedText: text("extracted_text").notNull().default(""), createdAt: text("created_at").notNull(),
}, t => [index("idx_materials_user_course").on(t.userId, t.courseId)]);

export const studyBlocks = sqliteTable("study_blocks", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), courseId: text("course_id"), eventId: text("event_id"),
  startsAt: text("starts_at").notNull(), minutes: integer("minutes").notNull(), status: text("status").notNull().default("planned"),
}, t => [index("idx_blocks_user_start").on(t.userId, t.startsAt)]);

export const settings = sqliteTable("settings", {
  userId: text("user_id").primaryKey(), availableDays: text("available_days").notNull().default("[1,2,3,4,5]"),
  hoursPerWeek: real("hours_per_week").notNull().default(8), reminderHours: integer("reminder_hours").notNull().default(24),
});

export const canvasConnections = sqliteTable("canvas_connections", {
  userId: text("user_id").primaryKey(), baseUrl: text("base_url").notNull(), accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(), expiresAt: text("expires_at"), lastSyncAt: text("last_sync_at"),
});

export const calendarImports = sqliteTable("calendar_imports", {
  userId: text("user_id").primaryKey(), lastImportAt: text("last_import_at").notNull(),
  summary: text("summary").notNull().default("{}"),
});
export const preferences = sqliteTable("preferences", {
  userId: text("user_id").primaryKey(), value: text("value").notNull().default("{}"),
});
export const flashcards = sqliteTable("flashcards", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), courseId: text("course_id"),
  question: text("question").notNull(), answer: text("answer").notNull(), source: text("source").notNull().default(""),
  dueAt: text("due_at").notNull(), intervalDays: integer("interval_days").notNull().default(0), reviews: integer("reviews").notNull().default(0),
}, t => [index("idx_flashcards_user_due").on(t.userId, t.dueAt)]);
export const focusSessions = sqliteTable("focus_sessions", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), courseId: text("course_id"),
  minutes: integer("minutes").notNull(), completedAt: text("completed_at").notNull(),
}, t => [index("idx_focus_user").on(t.userId)]);
export const gradeHistory = sqliteTable("grade_history", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), courseId: text("course_id").notNull(),
  grade: real("grade").notNull(), recordedAt: text("recorded_at").notNull(),
}, t => [index("idx_grades_user_course").on(t.userId, t.courseId)]);
