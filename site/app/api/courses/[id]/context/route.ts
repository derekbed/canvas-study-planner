import { database, jsonError, userId, type Course } from "@/lib/server";
import { briefFor, gapsFor, knowledgeFor, parseFacts } from "@/lib/course-knowledge";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = userId(request); if (!user) return jsonError("Sign in first.", 401);
  const { id } = await context.params;
  const course = await database().prepare("SELECT * FROM courses WHERE id=? AND user_id=?").bind(id, user).first<Course>();
  if (!course) return jsonError("Course not found.", 404);
  const row = await knowledgeFor(user, id);
  const facts = parseFacts(row?.facts_json || "[]");
  return Response.json({ brief: row ? briefFor(course, facts) : "", facts, gaps: gapsFor(facts), status: row?.status || "empty",
    sourceMaterialId: row?.source_material_id || null, updatedAt: row?.updated_at || null });
}
