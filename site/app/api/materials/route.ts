import { bucket, cleanText, database, jsonError, now, userId } from "@/lib/server";
import { extractMaterialText } from "@/lib/material-text";

export async function POST(request: Request) {
  const user = userId(request); if (!user) return jsonError("Sign in first.", 401);
  let form: FormData;
  try { form = await request.formData(); } catch { return jsonError("Could not read the file."); }
  const file = form.get("file"), courseId = cleanText(form.get("courseId"), 150), kind = cleanText(form.get("kind"), 30) || "notes";
  if (!(file instanceof File) || !courseId) return jsonError("Choose a course and file.");
  if (file.size > 20 * 1024 * 1024) return jsonError("Files must be under 20 MB.");
  if (!["application/pdf", "text/plain", "text/markdown"].includes(file.type) && !/\.(pdf|txt|md)$/i.test(file.name)) return jsonError("Upload a PDF, TXT, or Markdown file.");
  const db = database();
  const course = await db.prepare("SELECT id FROM courses WHERE id=? AND user_id=?").bind(courseId, user).first();
  if (!course) return jsonError("Course not found.", 404);
  const id = crypto.randomUUID(), key = `${user}/${id}`;
  let extracted: string;
  try { extracted = await extractMaterialText(file, cleanText(form.get("extractedText"), 500_000)); }
  catch { return jsonError("The PDF could not be read. Try a text PDF or upload extracted text.", 422); }
  try {
    await bucket().put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    await db.prepare("INSERT INTO materials (id,user_id,course_id,name,kind,mime_type,r2_key,extracted_text,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(id, user, courseId, file.name.slice(0,160), kind, file.type || "application/octet-stream", key, extracted, now()).run();
    return Response.json({ id, indexed: Boolean(extracted) }, { status: 201 });
  } catch (error) { console.error("Material upload failed", error); await bucket().delete(key).catch(() => {}); return jsonError("The file could not be saved. Please try again.", 503); }
}
