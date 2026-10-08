import { database, now } from "@/lib/server";
import { extensionError, extensionResponse, extensionUser, fromExtension, preflight } from "@/lib/extension";

export const OPTIONS = preflight;
export async function POST(request: Request) {
  if (!fromExtension(request)) return extensionError(request, "Local course saving is unavailable.", 403);
  const user = await extensionUser(request);
  if (!user) return extensionError(request, "Session expired. Pair the extension again.", 401);
  let raw: string, body: Record<string, unknown>;
  try { raw = await request.text(); body = JSON.parse(raw); } catch { return extensionError(request, "Invalid course.", 400); }
  if (raw.length > 800000 || !body || typeof body !== "object" || Array.isArray(body))
    return extensionError(request, "Invalid course.", 400);
  const db = database();
  try {
    if (body.action === "rename") {
      if (typeof body.courseId !== "string" || !body.courseId.trim() || typeof body.name !== "string" || !body.name.trim() || body.name.length > 120)
        return extensionError(request, "Choose a course name.", 400);
      const course = await db.prepare("SELECT id FROM courses WHERE id=? AND user_id=?").bind(body.courseId.trim(), user).first<{ id: string }>();
      if (!course) return extensionError(request, "Course not found.", 404);
      await db.prepare("UPDATE courses SET name=? WHERE id=? AND user_id=?").bind(body.name.trim(), course.id, user).run();
      return extensionResponse(request, { id: course.id, name: body.name.trim() });
    }
    if (body.action === "style") {
      const colors = new Set(["blue", "lavender", "peach", "mint", "butter", "rose", "sky", "teal", "violet", "orange"]);
      if (typeof body.courseId !== "string" || !body.courseId.trim() || typeof body.color !== "string" || !colors.has(body.color))
        return extensionError(request, "Choose a valid course color.", 400);
      if (typeof body.imageUrl !== "string" || body.imageUrl.length > 700000 ||
          (body.imageUrl && !/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(body.imageUrl)))
        return extensionError(request, "Choose a valid course picture.", 400);
      const course = await db.prepare("SELECT id FROM courses WHERE id=? AND user_id=?").bind(body.courseId.trim(), user).first<{ id: string }>();
      if (!course) return extensionError(request, "Course not found.", 404);
      await db.prepare("UPDATE courses SET color=?,image_url=? WHERE id=? AND user_id=?").bind(body.color, body.imageUrl, course.id, user).run();
      return extensionResponse(request, { id: course.id, color: body.color, imageUrl: body.imageUrl });
    }
    if (typeof body.canvasId !== "string" || !/^\d{1,20}$/.test(body.canvasId) ||
        typeof body.name !== "string" || !body.name.trim() || body.name.length > 120 ||
        typeof body.code !== "string" || body.code.length > 40)
      return extensionError(request, "Choose a valid Canvas course.", 400);
    const id = crypto.randomUUID();
    await db.prepare("INSERT OR IGNORE INTO courses (id,user_id,canvas_id,name,code,color,target_grade,grade_weights,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(id, user, body.canvasId, body.name.trim(), body.code.trim(), "teal", 90, "{}", "extension", now()).run();
    const row = await db.prepare("SELECT id FROM courses WHERE user_id=? AND canvas_id=?").bind(user, body.canvasId).first<{ id: string }>();
    return extensionResponse(request, { id: row?.id });
  } catch { return extensionError(request, "The course could not be saved. Try again.", 503); }
}
