import { database, now, setting } from "./server";

const encoder = new TextEncoder();
function bytesToBase64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function base64ToBytes(input: string) { return Uint8Array.from(atob(input), char => char.charCodeAt(0)); }
async function encryptionKey() {
  const raw = setting("TOKEN_ENCRYPTION_KEY"); if (!raw) throw new Error("Canvas encryption is not configured");
  const bytes = base64ToBytes(raw); if (bytes.length !== 32) throw new Error("Canvas encryption key must be 32 bytes");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), encoder.encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`;
}
export async function decrypt(value: string) {
  const [iv, cipher] = value.split(".");
  if (!iv || !cipher) throw new Error("Invalid encrypted token");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await encryptionKey(), base64ToBytes(cipher));
  return new TextDecoder().decode(plain);
}
export function canvasConfig() {
  const base = setting("CANVAS_BASE_URL"), id = setting("CANVAS_CLIENT_ID"), secret = setting("CANVAS_CLIENT_SECRET");
  if (!base || !id || !secret || !setting("TOKEN_ENCRYPTION_KEY")) return null;
  const parsed = new URL(base); if (parsed.protocol !== "https:") throw new Error("Canvas URL must use HTTPS");
  return { base: parsed.origin, id, secret };
}
export async function tokenFor(user: string) {
  const db = database();
  const row = await db.prepare("SELECT * FROM canvas_connections WHERE user_id = ?").bind(user).first<{
    base_url: string; access_token: string; refresh_token: string; expires_at: string | null;
  }>();
  if (!row) throw new Error("Connect Canvas first");
  if (!row.expires_at || Date.parse(row.expires_at) > Date.now() + 60_000) return { base: row.base_url, token: await decrypt(row.access_token) };
  const config = canvasConfig(); if (!config || config.base !== row.base_url) throw new Error("Canvas configuration changed");
  const response = await fetch(`${config.base}/login/oauth2/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: config.id, client_secret: config.secret, refresh_token: await decrypt(row.refresh_token) }),
  });
  if (!response.ok) throw new Error("Canvas connection expired. Please reconnect.");
  const data = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number };
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;
  await db.prepare("UPDATE canvas_connections SET access_token=?,refresh_token=?,expires_at=? WHERE user_id=?")
    .bind(await encrypt(data.access_token), await encrypt(data.refresh_token || await decrypt(row.refresh_token)), expiresAt, user).run();
  return { base: config.base, token: data.access_token };
}
async function canvasPages<T>(base: string, token: string, path: string, maxPages = 12): Promise<T[]> {
  let url: string | null = `${base}${path}`; const result: T[] = [];
  for (let page = 0; page < maxPages && url; page++) {
    const response: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Canvas returned ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error("Canvas returned an unexpected response");
    result.push(...body);
    const next: RegExpMatchArray | null = response.headers.get("Link")?.match(/<([^>]+)>; rel="next"/) || null;
    url = next?.[1] || null;
    if (url && new URL(url).origin !== base) throw new Error("Unexpected Canvas pagination URL");
  }
  return result;
}
type CanvasCourse = { id: number; name: string; course_code?: string; enrollments?: { type?: string; grades?: { current_score?: number } }[]; apply_assignment_group_weights?: boolean };
type CanvasAssignment = { id: number; name: string; description?: string; due_at?: string; html_url?: string; points_possible?: number; assignment_group_id?: number; submission?: { score?: number | null; submitted_at?: string | null; missing?: boolean; workflow_state?: string }; published?: boolean };
type CanvasGroup = { id: number; name: string; group_weight?: number };
type CalendarEvent = { id: number; title: string; description?: string; start_at?: string; end_at?: string; html_url?: string; context_code?: string };

export async function syncCanvas(user: string) {
  const { base, token } = await tokenFor(user);
  const db = database(); const created = now();
  const courses = (await canvasPages<CanvasCourse>(base, token, "/api/v1/courses?enrollment_state=active&include[]=total_scores&per_page=100", 3)).filter(c => c.id && c.name).slice(0, 30);
  if (!courses.length) throw new Error("No active Canvas courses were found.");
  await db.batch([
    db.prepare("DELETE FROM events WHERE user_id=? AND source='demo'").bind(user),
    db.prepare("DELETE FROM courses WHERE user_id=? AND source='demo'").bind(user),
  ]);
  let synced = 0;
  for (const course of courses) {
    const courseId = `canvas-${base}-${course.id}`;
    const grade = course.enrollments?.find(e => e.type === "student")?.grades?.current_score ?? course.enrollments?.[0]?.grades?.current_score ?? null;
    const groups = await canvasPages<CanvasGroup>(base, token, `/api/v1/courses/${course.id}/assignment_groups?per_page=100`, 4);
    const groupMap = new Map(groups.map(g => [g.id, g.name]));
    const weights = Object.fromEntries(groups.filter(g => typeof g.group_weight === "number").map(g => [g.name, g.group_weight]));
    await db.prepare("INSERT INTO courses (id,user_id,canvas_id,name,code,color,target_grade,current_grade,grade_weights,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,code=excluded.code,current_grade=excluded.current_grade,grade_weights=excluded.grade_weights")
      .bind(courseId, user, String(course.id), course.name.slice(0,120), (course.course_code || "").slice(0,40), ["blue","violet","orange","teal","rose"][synced % 5], 90, grade, JSON.stringify(course.apply_assignment_group_weights ? weights : {}), "canvas", created).run();
    const assignments = await canvasPages<CanvasAssignment>(base, token, `/api/v1/courses/${course.id}/assignments?include[]=submission&per_page=100`, 12);
    const statements = assignments.filter(a => a.published !== false && a.due_at).map(a => {
      const submission = a.submission;
      const status = submission?.missing ? "missing" : submission?.submitted_at || submission?.workflow_state === "graded" ? "done" : "upcoming";
      return db.prepare("INSERT INTO events (id,user_id,course_id,canvas_id,title,description,due_at,kind,points_possible,points_earned,status,source,url,estimated_minutes,grade_group,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,due_at=excluded.due_at,points_possible=excluded.points_possible,points_earned=excluded.points_earned,status=excluded.status,url=excluded.url,grade_group=excluded.grade_group")
        .bind(`canvas-assignment-${base}-${a.id}`, user, courseId, String(a.id), a.name.slice(0,180), (a.description || "").slice(0,10000), a.due_at, "assignment", a.points_possible ?? null, submission?.score ?? null, status, "canvas", a.html_url || null, 60, groupMap.get(a.assignment_group_id || -1) || "", created);
    });
    for (let i = 0; i < statements.length; i += 80) await db.batch(statements.slice(i, i + 80));
    synced++;
  }
  const start = new Date(); start.setFullYear(start.getFullYear() - 1);
  const end = new Date(); end.setFullYear(end.getFullYear() + 2);
  const params = `start_date=${start.toISOString().slice(0,10)}&end_date=${end.toISOString().slice(0,10)}&per_page=100`;
  for (const type of ["event"]) {
    const entries = await canvasPages<CalendarEvent>(base, token, `/api/v1/calendar_events?type=${type}&${params}`, 20);
    const statements = entries.filter(e => e.start_at && e.title).map(e => {
      const match = e.context_code?.match(/^course_(\d+)$/);
      const courseId = match ? `canvas-${base}-${match[1]}` : null;
      return db.prepare("INSERT INTO events (id,user_id,course_id,canvas_id,title,description,due_at,kind,status,source,url,estimated_minutes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,due_at=excluded.due_at,url=excluded.url")
        .bind(`canvas-calendar-${type}-${base}-${e.id}`, user, courseId, String(e.id), e.title.slice(0,180), (e.description || "").slice(0,10000), e.start_at, type === "assignment" ? "assignment" : "event", "upcoming", "canvas", e.html_url || null, 30, created);
    });
    for (let i = 0; i < statements.length; i += 80) await db.batch(statements.slice(i, i + 80));
  }
  await db.prepare("UPDATE canvas_connections SET last_sync_at=? WHERE user_id=?").bind(now(), user).run();
  return { courses: synced };
}
