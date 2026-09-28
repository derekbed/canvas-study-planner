import { bucket, database, jsonError, userId } from "@/lib/server";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = userId(request); if (!user) return jsonError("Sign in first.", 401);
  const { id } = await context.params;
  const row = await database().prepare("SELECT name,mime_type,r2_key FROM materials WHERE id=? AND user_id=?").bind(id, user).first<{ name: string; mime_type: string; r2_key: string }>();
  if (!row?.r2_key) return jsonError("File not found.", 404);
  const object = await bucket().get(row.r2_key); if (!object) return jsonError("File not found.", 404);
  const safeName = row.name.replace(/[\r\n"\\]/g, "_");
  return new Response(object.body, { headers: { "Content-Type": row.mime_type, "Content-Disposition": `attachment; filename="${safeName}"` } });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = userId(request); if (!user) return jsonError("Sign in first.", 401);
  const { id } = await context.params;
  const row = await database().prepare("SELECT r2_key FROM materials WHERE id=? AND user_id=?").bind(id, user).first<{ r2_key: string }>();
  if (!row) return jsonError("File not found.", 404);
  if (row.r2_key) await bucket().delete(row.r2_key);
  await database().prepare("DELETE FROM materials WHERE id=? AND user_id=?").bind(id, user).run();
  return Response.json({ ok: true });
}
