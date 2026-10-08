import { database, setting } from "@/lib/server";
import { extensionError, extensionResponse, extensionUser, fromExtension, preflight } from "@/lib/extension";
import { insightsFor, type KnowledgeGap } from "@/lib/course-knowledge";

export const OPTIONS = preflight;
function safeEventUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.origin === "https://canvas.upenn.edu" &&
      !/\/feeds?\/|\.ics(?:$|\/)|calendar[_-]?feed/i.test(url.pathname) ? url.origin + url.pathname : null;
  } catch { return null; }
}
export async function GET(request: Request) {
  if (!fromExtension(request)) return extensionError(request, "Local extension workspace is unavailable.", 403);
  const user = await extensionUser(request);
  if (!user) return extensionError(request, "Session expired. Pair the extension again.", 401);
  try {
    const db = database();
    const [courses, events, materials, knowledge, connection, pref] = await Promise.all([
      db.prepare("SELECT id,canvas_id,name,code,color,image_url,current_grade,target_grade,source FROM courses WHERE user_id=? ORDER BY name LIMIT 100").bind(user).all(),
      db.prepare("SELECT id,course_id,title,due_at,kind,status,source,url,points_possible FROM events WHERE user_id=? AND due_at>=? ORDER BY due_at LIMIT 250")
        .bind(user, new Date(Date.now() - 14 * 86400000).toISOString()).all(),
      db.prepare("SELECT id,course_id,name,kind,mime_type,created_at,length(extracted_text)>0 AS indexed FROM materials WHERE user_id=? ORDER BY created_at DESC LIMIT 200").bind(user).all(),
      db.prepare("SELECT course_id,brief,gaps_json,status FROM course_knowledge WHERE user_id=? LIMIT 100").bind(user).all<{ course_id: string; brief: string; gaps_json: string; status: string }>(),
      db.prepare("SELECT base_url,last_sync_at FROM canvas_connections WHERE user_id=?").bind(user).first(),
      db.prepare("SELECT value FROM preferences WHERE user_id=?").bind(user).first<{ value: string }>(),
    ]);
    let consent = false;
    try { consent = Boolean(JSON.parse(pref?.value || "{}").consent); } catch { /* default false */ }
    const summaries = knowledge.results.filter(row => row.status !== "empty").map(row => {
      let gaps: KnowledgeGap[] = [];
      try { const parsed = JSON.parse(row.gaps_json); if (Array.isArray(parsed)) gaps = parsed.slice(0, 20); } catch { /* no gaps */ }
      return { courseId: row.course_id, status: row.status, gapCount: gaps.length,
        insights: insightsFor(events.results.filter(event => event.course_id === row.course_id).map(event => ({
          title: String(event.title), due_at: String(event.due_at), status: String(event.status), kind: String(event.kind) })), gaps,
          courses.results.find(course => course.id === row.course_id) as { current_grade: number | null; target_grade: number } | undefined) };
    });
    return extensionResponse(request, { courses: courses.results, events: events.results.map(event => ({ ...event, url: safeEventUrl(event.url) })), materials: materials.results, knowledge: summaries,
      connection, aiAvailable: Boolean(setting("OPENAI_API_KEY")), settings: { aiExcerptConsent: consent } });
  } catch { return extensionError(request, "Workspace could not load. Check the local Coursewise server.", 503); }
}
export const POST = GET;
