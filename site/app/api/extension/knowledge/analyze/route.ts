import { database, type Course, type Material } from "@/lib/server";
import { extensionError, extensionResponse, extensionUser, fromExtension, preflight } from "@/lib/extension";
import { analyzeMaterial } from "@/lib/material-analysis";

export const OPTIONS = preflight;
export async function POST(request: Request) {
  if (!fromExtension(request)) return extensionError(request, "Local course analysis is unavailable.", 403);
  const user = await extensionUser(request);
  if (!user) return extensionError(request, "Session expired. Pair the extension again.", 401);
  let raw: string, body: Record<string, unknown>;
  try { raw = await request.text(); body = JSON.parse(raw); } catch { return extensionError(request, "Invalid analysis request.", 400); }
  if (raw.length > 1000 || !body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.courseId !== "string" || body.courseId.length > 150 ||
      typeof body.materialId !== "string" || body.materialId.length > 150)
    return extensionError(request, "Choose a course syllabus to analyze.", 400);
  const db = database();
  const [course, material, pref] = await Promise.all([
    db.prepare("SELECT * FROM courses WHERE id=? AND user_id=?").bind(body.courseId, user).first<Course>(),
    db.prepare("SELECT * FROM materials WHERE id=? AND course_id=? AND user_id=?").bind(body.materialId, body.courseId, user).first<Material>(),
    db.prepare("SELECT value FROM preferences WHERE user_id=?").bind(user).first<{ value: string }>(),
  ]);
  if (!course || !material) return extensionError(request, "Syllabus not found in your course.", 403);
  let consent = false;
  try { consent = Boolean(JSON.parse(pref?.value || "{}").consent); } catch { /* default false */ }
  if (!consent) return extensionError(request, "Enable AI excerpt consent in Coursewise Data & privacy first.", 403);
  try {
    return extensionResponse(request, await analyzeMaterial(user, course, material));
  } catch (error) {
    if (error instanceof Error && error.message === "NO_TEXT") return extensionError(request, "This PDF has no readable text. Try a text PDF or TXT file.", 409);
    return extensionError(request, "Coursewise could not build the course context. Try again.", 503);
  }
}
