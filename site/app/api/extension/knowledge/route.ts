import { database, now, type Course, type Event } from "@/lib/server";
import { extensionError, extensionResponse, extensionUser, fromExtension, preflight } from "@/lib/extension";
import { KNOWLEDGE_KEYS, briefFor, gapsFor, insightsFor, knowledgeFor, parseFacts, saveKnowledge, type KnowledgeFact, type KnowledgeKey } from "@/lib/course-knowledge";

export const OPTIONS = preflight;
export async function POST(request: Request) {
  if (!fromExtension(request)) return extensionError(request, "Local course knowledge is unavailable.", 403);
  const user = await extensionUser(request);
  if (!user) return extensionError(request, "Session expired. Pair the extension again.", 401);
  let raw: string, body: Record<string, unknown>;
  try { raw = await request.text(); body = JSON.parse(raw); } catch { return extensionError(request, "Invalid knowledge request.", 400); }
  if (raw.length > 2500 || !body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.courseId !== "string" || body.courseId.length > 150) return extensionError(request, "Invalid knowledge request.", 400);
  const db = database();
  const course = await db.prepare("SELECT * FROM courses WHERE id=? AND user_id=?").bind(body.courseId, user).first<Course>();
  if (!course) return extensionError(request, "Course not found in your workspace.", 403);
  let row = await knowledgeFor(user, course.id);
  if (body.action === "save") {
    if (!KNOWLEDGE_KEYS.includes(body.key as KnowledgeKey) || typeof body.value !== "string" ||
        !body.value.trim() || body.value.length > 1000) return extensionError(request, "Enter a short course fact.", 400);
    const key = body.key as KnowledgeKey;
    const value = body.value.trim().replace(/\b(?:https?|webcal):\/\/[^\s<>"']*(?:\/feeds?\/|\.ics\b|calendar[_-]?feed)[^\s<>"']*/gi, "[private calendar link omitted]");
    const facts = parseFacts(row?.facts_json || "[]").filter(fact => fact.key !== key);
    const fact: KnowledgeFact = { key, value, sourceLabel: "Student provided", sourceMaterialId: null,
      origin: "student", confidence: "medium", updatedAt: now() };
    facts.push(fact);
    await saveKnowledge(user, course, facts, row?.source_material_id || null, row?.status === "indexed" ? "indexed" : "student_only");
    row = await knowledgeFor(user, course.id);
  } else if (body.action !== "get") return extensionError(request, "Unknown knowledge action.", 400);
  const facts = parseFacts(row?.facts_json || "[]"), gaps = gapsFor(facts);
  const events = (await db.prepare("SELECT title,due_at,status,kind FROM events WHERE user_id=? AND course_id=? AND due_at>=? ORDER BY due_at LIMIT 50")
    .bind(user, course.id, new Date(Date.now() - 14 * 86400000).toISOString()).all<Event>()).results;
  return extensionResponse(request, { courseId: course.id, brief: row ? briefFor(course, facts) : "", facts, gaps,
    insights: insightsFor(events, gaps, course), status: row?.status || "empty", sourceMaterialId: row?.source_material_id || null,
    updatedAt: row?.updated_at || null });
}
