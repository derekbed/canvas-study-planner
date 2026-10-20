import { env } from "cloudflare:workers";

export type Course = {
  id: string;
  user_id: string;
  canvas_id: string | null;
  name: string;
  code: string;
  color: string;
  target_grade: number;
  current_grade: number | null;
  grade_weights: string;
  source: string;
  created_at: string;
};
export type Event = {
  id: string;
  user_id: string;
  course_id: string | null;
  canvas_id: string | null;
  title: string;
  description: string;
  due_at: string;
  kind: string;
  points_possible: number | null;
  points_earned: number | null;
  status: string;
  source: string;
  url: string | null;
  estimated_minutes: number;
  grade_group: string;
  created_at: string;
};
export type Material = {
  id: string;
  user_id: string;
  course_id: string;
  name: string;
  kind: string;
  mime_type: string;
  r2_key: string | null;
  extracted_text: string;
  created_at: string;
};
export type StudyBlock = {
  id: string;
  user_id: string;
  course_id: string | null;
  event_id: string | null;
  starts_at: string;
  minutes: number;
  status: string;
};
export type Settings = {
  user_id: string;
  available_days: string;
  hours_per_week: number;
  reminder_hours: number;
};

export function database() {
  return env.DB as D1Database;
}
export function bucket() {
  return env.BUCKET as R2Bucket;
}
export function setting(name: string): string | undefined {
  return (env as unknown as Record<string, string | undefined>)[name];
}
export function authenticatedUserId(request: Request): string | null {
  const authenticated = request.headers.get("oai-authenticated-user-id");
  if (authenticated) return authenticated;
  const hostname = new URL(request.url).hostname;
  return process.env.NODE_ENV !== "production" &&
    (hostname === "localhost" || hostname === "127.0.0.1")
    ? "local-demo"
    : null;
}
export function sameOriginMutation(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin";
}
export function ageGateRequired() {
  return (
    process.env.NODE_ENV === "production" ||
    Boolean(setting("COURSEWISE_PUBLIC_ORIGIN"))
  );
}
export async function userId(request: Request): Promise<string | null> {
  if (!sameOriginMutation(request)) return null;
  const user = authenticatedUserId(request);
  if (!user) return null;
  // A public deployment must not serve student records before age eligibility is affirmed.
  if (!ageGateRequired()) return user;
  const row = await database()
    .prepare("SELECT value FROM preferences WHERE user_id=?")
    .bind(user)
    .first<{ value: string }>();
  try {
    return JSON.parse(row?.value || "{}").age13ConfirmedAt ? user : null;
  } catch {
    return null;
  }
}
export function jsonError(message: string, status = 400) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
export function now() {
  return new Date().toISOString();
}
export function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export function numberIn(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

export async function ensureWorkspace(user: string) {
  const db = database();
  const row = await db
    .prepare("SELECT id,source FROM courses WHERE user_id = ? LIMIT 1")
    .bind(user)
    .first<{ id: string; source: string }>();
  if (row) {
    await db
      .prepare("INSERT OR IGNORE INTO preferences (user_id,value) VALUES (?,?)")
      .bind(user, '{"initialized":true}')
      .run();
    return;
  }
  const initialized = await db
    .prepare("SELECT user_id FROM preferences WHERE user_id=?")
    .bind(user)
    .first();
  if (initialized) return;
  await db
    .prepare("INSERT OR IGNORE INTO preferences (user_id,value) VALUES (?,?)")
    .bind(user, JSON.stringify({ initialized: true }))
    .run();
  await db
    .prepare(
      "INSERT OR IGNORE INTO settings (user_id,available_days,hours_per_week,reminder_hours) VALUES (?,?,?,?)",
    )
    .bind(user, "[1,2,3,4,5]", 8, 24)
    .run();
}

export async function workspace(user: string) {
  await ensureWorkspace(user);
  const db = database();
  const [
    courses,
    events,
    materials,
    blocks,
    settings,
    connection,
    prefs,
    calendarImport,
    cards,
    focusSessions,
    gradeHistory,
  ] = await Promise.all([
    db
      .prepare(
        "SELECT * FROM courses WHERE user_id = ? ORDER BY created_at, name",
      )
      .bind(user)
      .all<Course>(),
    db
      .prepare("SELECT * FROM events WHERE user_id = ? ORDER BY due_at")
      .bind(user)
      .all<Event>(),
    db
      .prepare(
        "SELECT id,user_id,course_id,name,kind,mime_type,r2_key,created_at,substr(extracted_text,1,160) as preview FROM materials WHERE user_id = ? ORDER BY created_at DESC",
      )
      .bind(user)
      .all(),
    db
      .prepare(
        "SELECT * FROM study_blocks WHERE user_id = ? ORDER BY starts_at",
      )
      .bind(user)
      .all<StudyBlock>(),
    db
      .prepare("SELECT * FROM settings WHERE user_id = ?")
      .bind(user)
      .first<Settings>(),
    db
      .prepare(
        "SELECT base_url,last_sync_at FROM canvas_connections WHERE user_id = ?",
      )
      .bind(user)
      .first(),
    db
      .prepare("SELECT value FROM preferences WHERE user_id=?")
      .bind(user)
      .first<{ value: string }>(),
    db
      .prepare(
        "SELECT last_import_at,summary FROM calendar_imports WHERE user_id=?",
      )
      .bind(user)
      .first(),
    db
      .prepare("SELECT * FROM flashcards WHERE user_id=? ORDER BY due_at")
      .bind(user)
      .all(),
    db
      .prepare(
        "SELECT * FROM focus_sessions WHERE user_id=? ORDER BY completed_at DESC",
      )
      .bind(user)
      .all(),
    db
      .prepare(
        "SELECT course_id,grade,recorded_at FROM grade_history WHERE user_id=? ORDER BY recorded_at",
      )
      .bind(user)
      .all(),
  ]);
  return {
    preferences: JSON.parse(prefs?.value || "{}"),
    calendarImport,
    cards: cards.results,
    focusSessions: focusSessions.results,
    gradeHistory: gradeHistory.results,
    courses: courses.results,
    events: events.results,
    materials: materials.results,
    blocks: blocks.results,
    settings,
    connection,
    canvasAvailable: Boolean(
      setting("CANVAS_BASE_URL") &&
        setting("CANVAS_CLIENT_ID") &&
        setting("CANVAS_CLIENT_SECRET") &&
        setting("TOKEN_ENCRYPTION_KEY"),
    ),
  };
}
