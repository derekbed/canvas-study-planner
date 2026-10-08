import { bucket, database } from "@/lib/server";
import { extensionError, extensionResponse, extensionUser, fromExtension, preflight } from "@/lib/extension";
import { forgetMaterialKnowledge } from "@/lib/course-knowledge";

export const OPTIONS = preflight;
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!fromExtension(request)) return extensionError(request, "Local extension deletion is unavailable.", 403);
  const user = await extensionUser(request);
  if (!user) return extensionError(request, "Session expired. Pair the extension again.", 401);
  const { id } = await context.params;
  const db = database();
  const row = await db.prepare("SELECT r2_key,course_id FROM materials WHERE id=? AND user_id=?").bind(id, user).first<{ r2_key: string | null; course_id: string }>();
  if (!row) return extensionError(request, "Material not found.", 404);
  try {
    if (row.r2_key) await bucket().delete(row.r2_key);
    await forgetMaterialKnowledge(user, row.course_id, id);
    await db.prepare("DELETE FROM materials WHERE id=? AND user_id=?").bind(id, user).run();
    return extensionResponse(request, { ok: true });
  } catch { return extensionError(request, "Material could not be deleted. Try again.", 503); }
}
