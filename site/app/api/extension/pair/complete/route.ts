import { database } from "@/lib/server";
import { extensionError, extensionResponse, fromExtension, hashSecret, preflight, randomSecret, TOKEN_TTL } from "@/lib/extension";
export const OPTIONS = preflight;
export async function POST(request: Request) {
  if (!fromExtension(request)) return extensionError(request, "Local extension pairing is unavailable.", 403);
  let body: { code?: unknown };
  try { body = await request.json(); } catch { return extensionError(request, "Invalid pairing request.", 400); }
  if (typeof body.code !== "string" || !/^[a-f0-9]{48}$/.test(body.code)) return extensionError(request, "Invalid pairing code.", 400);
  const db = database(), codeHash = await hashSecret(body.code);
  const row = await db.prepare("SELECT user_id,approved FROM extension_pairings WHERE code_hash=? AND expires_at>? AND consumed=0")
    .bind(codeHash, Date.now()).first<{ user_id: string | null; approved: number }>();
  if (!row) return extensionError(request, "Pairing code expired. Start again.", 403);
  if (!row.approved || !row.user_id) return extensionError(request, "Confirm pairing in the Coursewise tab first.", 409);
  const claimed = await db.prepare("UPDATE extension_pairings SET consumed=1 WHERE code_hash=? AND consumed=0 AND approved=1")
    .bind(codeHash).run();
  if (!claimed.meta.changes) return extensionError(request, "Pairing code already used.", 403);
  const token = randomSecret(), expiresAt = Date.now() + TOKEN_TTL;
  await db.prepare("INSERT INTO extension_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)")
    .bind(await hashSecret(token), row.user_id, expiresAt).run();
  return extensionResponse(request, { token, expiresAt });
}
