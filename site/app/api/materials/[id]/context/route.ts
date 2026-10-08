import { database, jsonError, userId, type Course, type Material } from "@/lib/server";
import { analyzeMaterial } from "@/lib/material-analysis";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await userId(request); if (!user) return jsonError("Sign in first.", 401);
  const { id } = await context.params;
  const db = database();
  const material = await db.prepare("SELECT * FROM materials WHERE id=? AND user_id=?").bind(id, user).first<Material>();
  if (!material) return jsonError("File not found.", 404);
  const course = await db.prepare("SELECT * FROM courses WHERE id=? AND user_id=?").bind(material.course_id, user).first<Course>();
  if (!course) return jsonError("Course not found.", 404);
  const pref = await db.prepare("SELECT value FROM preferences WHERE user_id=?").bind(user).first<{ value: string }>();
  let consent = false;
  try { consent = Boolean(JSON.parse(pref?.value || "{}").consent); } catch { /* default false */ }
  if (!consent) return jsonError("Enable AI excerpt consent in Data & privacy first.", 403);
  try { return Response.json(await analyzeMaterial(user, course, material)); }
  catch (error) {
    if (error instanceof Error && error.message === "NO_TEXT") return jsonError("This file has no readable text.", 409);
    return jsonError("Course context could not be built. Try again.", 503);
  }
}
