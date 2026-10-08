import { env } from "cloudflare:workers";

export type Course = { id: string; user_id: string; canvas_id: string | null; name: string; code: string; color: string; target_grade: number; current_grade: number | null; grade_weights: string; source: string; created_at: string };
export type Event = { id: string; user_id: string; course_id: string | null; canvas_id: string | null; title: string; description: string; due_at: string; kind: string; points_possible: number | null; points_earned: number | null; status: string; source: string; url: string | null; estimated_minutes: number; grade_group: string; created_at: string };
export type Material = { id: string; user_id: string; course_id: string; name: string; kind: string; mime_type: string; r2_key: string | null; extracted_text: string; created_at: string };
export type StudyBlock = { id: string; user_id: string; course_id: string | null; event_id: string | null; starts_at: string; minutes: number; status: string };
export type Settings = { user_id: string; available_days: string; hours_per_week: number; reminder_hours: number };

export function database() { return env.DB as D1Database; }
export function bucket() { return env.BUCKET as R2Bucket; }
export function setting(name: string): string | undefined { return (env as unknown as Record<string, string | undefined>)[name]; }
export function userId(request: Request): string | null {
  const authenticated = request.headers.get("oai-authenticated-user-id");
  if (authenticated) return authenticated;
  const hostname = new URL(request.url).hostname;
  return process.env.NODE_ENV !== "production" && (hostname === "localhost" || hostname === "127.0.0.1") ? "local-demo" : null;
}
export function jsonError(message: string, status = 400) { return Response.json({ error: message }, { status }); }
export function now() { return new Date().toISOString(); }
export function cleanText(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
export function numberIn(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value); return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

export async function ensureDemo(user: string) {
  const db = database();
  const row = await db.prepare("SELECT id,source FROM courses WHERE user_id = ? LIMIT 1").bind(user).first<{ id: string; source: string }>();
  if (row) { await db.prepare("INSERT OR IGNORE INTO preferences (user_id,value) VALUES (?,?)").bind(user,'{"initialized":true}').run(); return; }
  const initialized = await db.prepare("SELECT user_id FROM preferences WHERE user_id=?").bind(user).first();
  if (initialized) return;
  await db.prepare("INSERT OR IGNORE INTO preferences (user_id,value) VALUES (?,?)").bind(user,JSON.stringify({initialized:true})).run();
  await db.prepare("INSERT OR IGNORE INTO settings (user_id,available_days,hours_per_week,reminder_hours) VALUES (?,?,?,?)").bind(user, "[1,2,3,4,5]", 8, 24).run();
  return;
  const today = new Date(); const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7)); monday.setHours(12, 0, 0, 0);
  const date = (day: number, hour = 23) => { const d = new Date(monday); d.setDate(monday.getDate() + day); d.setHours(hour, 59, 0, 0); return d.toISOString(); };
  const created = now();
  const courses = [
    ["bio", "AP Biology", "BIO 301", "blue", 91],
    ["lit", "English Literature", "ENG 220", "violet", 88],
    ["calc", "Calculus I", "MATH 101", "orange", 84],
  ] as const;
  const assignments = [
    ["bio", "Cell signaling worksheet", 1, 40, 50, "Homework", "Review receptor proteins and signal transduction. Submit the worksheet in Canvas.", "assignment"],
    ["lit", "Essay outline", 2, 70, 20, "Essays", "Prepare an outline with a thesis and at least three sources.", "assignment"],
    ["calc", "Problem set 4", 3, 90, 100, "Homework", "Complete problems 1–24 on derivatives.", "assignment"],
    ["bio", "Unit 3 quiz", 4, 80, 50, "Quizzes", "Topics: cell communication, feedback, and the cell cycle.", "quiz"],
    ["lit", "Novel discussion", 5, 45, 10, "Participation", "Bring two discussion questions and one passage.", "event"],
    ["calc", "Midterm review", 6, 120, 100, "Exams", "Review limits and derivative rules.", "event"],
  ] as const;
  const statements = courses.map(([key, name, code, color, grade]) => db.prepare(
    "INSERT OR IGNORE INTO courses (id,user_id,name,code,color,target_grade,current_grade,grade_weights,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).bind(`demo-${user}-${key}`, user, name, code, color, 90, grade, "{}", "demo", created));
  statements.push(...assignments.map(([course, title, day, minutes, points, group, description, kind], index) => db.prepare(
    "INSERT OR IGNORE INTO events (id,user_id,course_id,title,description,due_at,kind,points_possible,status,source,estimated_minutes,grade_group,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(`demo-${user}-event-${index}`, user, `demo-${user}-${course}`, title, description, date(day), kind, points, "upcoming", "demo", minutes, group, created)));
  statements.push(db.prepare("INSERT OR IGNORE INTO settings (user_id,available_days,hours_per_week,reminder_hours) VALUES (?,?,?,?)").bind(user, "[1,2,3,4,5]", 8, 24));
  await db.batch(statements);
  await seedDemoScores(user);
}

async function seedDemoScores(user: string) {
  const db = database();
  const today = new Date(), created = now();
  const past = (days: number) => new Date(today.getTime() - days * 86_400_000).toISOString();
  const rows = [
    ["bio", "Lab report 2", 92, 100, "Labs", 5],
    ["bio", "Reading check", 44, 50, "Quizzes", 9],
    ["lit", "Close reading essay", 88, 100, "Essays", 6],
    ["calc", "Problem set 3", 84, 100, "Homework", 5],
  ] as const;
  await db.batch(rows.map(([course, title, earned, possible, group, days], index) => db.prepare(
    "INSERT OR IGNORE INTO events (id,user_id,course_id,title,description,due_at,kind,points_possible,points_earned,status,source,estimated_minutes,grade_group,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(`demo-${user}-graded-${index}`, user, `demo-${user}-${course}`, title, "Previously graded work.", past(days), "assignment", possible, earned, "done", "demo", 60, group, created)));
}

export async function workspace(user: string) {
  await ensureDemo(user);
  const db = database();
  const [courses, events, materials, blocks, settings, connection] = await Promise.all([
    db.prepare("SELECT * FROM courses WHERE user_id = ? ORDER BY created_at, name").bind(user).all<Course>(),
    db.prepare("SELECT * FROM events WHERE user_id = ? ORDER BY due_at").bind(user).all<Event>(),
    db.prepare("SELECT id,user_id,course_id,name,kind,mime_type,r2_key,created_at,substr(extracted_text,1,160) as preview FROM materials WHERE user_id = ? ORDER BY created_at DESC").bind(user).all(),
    db.prepare("SELECT * FROM study_blocks WHERE user_id = ? ORDER BY starts_at").bind(user).all<StudyBlock>(),
    db.prepare("SELECT * FROM settings WHERE user_id = ?").bind(user).first<Settings>(),
    db.prepare("SELECT base_url,last_sync_at FROM canvas_connections WHERE user_id = ?").bind(user).first(),
  ]);
  const [prefs, calendarImport, cards, focusSessions, gradeHistory] = await Promise.all([
    db.prepare("SELECT value FROM preferences WHERE user_id=?").bind(user).first<{value:string}>(),
    db.prepare("SELECT last_import_at,summary FROM calendar_imports WHERE user_id=?").bind(user).first(),
    db.prepare("SELECT * FROM flashcards WHERE user_id=? ORDER BY due_at").bind(user).all(),
    db.prepare("SELECT * FROM focus_sessions WHERE user_id=? ORDER BY completed_at DESC").bind(user).all(),
    db.prepare("SELECT course_id,grade,recorded_at FROM grade_history WHERE user_id=? ORDER BY recorded_at").bind(user).all(),
  ]);
  return { preferences: JSON.parse(prefs?.value || "{}"), calendarImport, cards:cards.results, focusSessions:focusSessions.results, gradeHistory:gradeHistory.results, courses: courses.results, events: events.results, materials: materials.results, blocks: blocks.results, settings, connection, aiAvailable: Boolean(setting("OPENAI_API_KEY")), canvasAvailable: Boolean(setting("CANVAS_BASE_URL") && setting("CANVAS_CLIENT_ID") && setting("CANVAS_CLIENT_SECRET") && setting("TOKEN_ENCRYPTION_KEY")) };
}
