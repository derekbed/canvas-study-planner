import { bucket, database, jsonError, userId } from "@/lib/server";
import { forgetMaterialKnowledge } from "@/lib/course-knowledge";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await userId(request); if (!user) return jsonError("Sign in first.", 401);
  const { id } = await context.params;
  const row = await database().prepare("SELECT name,mime_type,r2_key FROM materials WHERE id=? AND user_id=?").bind(id, user).first<{ name: string; mime_type: string; r2_key: string }>();
  if (!row?.r2_key) return jsonError("File not found.", 404);
  const object = await bucket().get(row.r2_key); if (!object) return jsonError("File not found.", 404);
  const safeName = row.name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return new Response(object.body, { headers: { "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff", "Content-Type": row.mime_type, "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(row.name)}` } });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await userId(request); if (!user) return jsonError("Sign in first.", 401);
  const { id } = await context.params;
  const row = await database().prepare("SELECT r2_key,course_id FROM materials WHERE id=? AND user_id=?").bind(id, user).first<{ r2_key: string; course_id: string }>();
  if (!row) return jsonError("File not found.", 404);
  if (row.r2_key) await bucket().delete(row.r2_key);
  await forgetMaterialKnowledge(user, row.course_id, id);
  await database().prepare("DELETE FROM materials WHERE id=? AND user_id=?").bind(id, user).run();
  return Response.json({ ok: true });
}
