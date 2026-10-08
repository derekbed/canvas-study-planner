import { bucket, database, now } from "@/lib/server";
import { extensionError, extensionResponse, extensionUser, fromExtension, preflight } from "@/lib/extension";
import { extractMaterialText } from "@/lib/material-text";

export const OPTIONS = preflight;
const MAX_BYTES = 5 * 1024 * 1024;
export async function POST(request: Request) {
  if (!fromExtension(request)) return extensionError(request, "Local extension upload is unavailable.", 403);
  const user = await extensionUser(request);
  if (!user) return extensionError(request, "Session expired. Pair the extension again.", 401);
  if (Number(request.headers.get("content-length") || 0) > 7_100_000) return extensionError(request, "File must be under 5 MB.", 413);
  let body: { courseId?: unknown; kind?: unknown; file?: { name?: unknown; type?: unknown; size?: unknown; base64?: unknown } };
  try {
    const rawBody = await request.text();
    if (rawBody.length > 7_100_000) return extensionError(request, "File must be under 5 MB.", 413);
    body = JSON.parse(rawBody);
  } catch { return extensionError(request, "Could not read the file.", 400); }
  const raw = body?.file, courseId = body?.courseId, kind = body?.kind;
  if (!raw || typeof raw.name !== "string" || typeof raw.type !== "string" ||
      typeof raw.size !== "number" || !Number.isInteger(raw.size) || raw.size <= 0 || raw.size > MAX_BYTES ||
      typeof raw.base64 !== "string" || raw.base64.length > 7_000_000 ||
      typeof courseId !== "string" || !courseId || courseId.length > 150 ||
      (kind !== "syllabus" && kind !== "notes")) return extensionError(request, "Choose an owned course and file.", 400);
  if (raw.name.length > 160) return extensionError(request, "File must have a short name.", 413);
  const ext = raw.name.toLowerCase().match(/\.(pdf|txt|md)$/)?.[1];
  const accepted = { pdf: ["application/pdf"], txt: ["text/plain"], md: ["text/markdown", "text/plain"] } as const;
  if (!ext || !accepted[ext as keyof typeof accepted].includes(raw.type as never))
    return extensionError(request, "Upload a PDF, TXT, or Markdown file.", 400);
  let file: File;
  try {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw.base64)) throw new Error("Invalid base64");
    const decoded = atob(raw.base64);
    if (decoded.length !== raw.size) throw new Error("Invalid file size");
    const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
    file = new File([bytes], raw.name, { type: raw.type });
  } catch { return extensionError(request, "File could not be read. Select it again.", 400); }
  const db = database();
  if (!await db.prepare("SELECT id FROM courses WHERE id=? AND user_id=?").bind(courseId, user).first())
    return extensionError(request, "Course not found in your Coursewise workspace.", 403);
  const id = crypto.randomUUID(), key = `${user}/${id}`;
  let extracted: string;
  try { extracted = await extractMaterialText(file); }
  catch { return extensionError(request, "The PDF could not be read. Try a text PDF.", 422); }
  try {
    await bucket().put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    await db.prepare("INSERT INTO materials (id,user_id,course_id,name,kind,mime_type,r2_key,extracted_text,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(id, user, courseId, file.name, kind, file.type, key, extracted, now()).run();
    return extensionResponse(request, { id, name: file.name, courseId, indexed: Boolean(extracted) }, 201);
  } catch { await bucket().delete(key).catch(() => {}); return extensionError(request, "The file could not be saved. Try again.", 503); }
}
