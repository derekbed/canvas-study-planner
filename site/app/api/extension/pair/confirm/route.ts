import { database, jsonError, userId } from "@/lib/server";
import { hashSecret, extensionSiteAllowed } from "@/lib/extension";
export async function POST(request: Request) {
  if (!extensionSiteAllowed(request)) return jsonError("Pairing is unavailable.", 403);
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) return jsonError("Open the pairing page in Coursewise.", 403);
  // Pairing always requires the Sites-authenticated browser session, even in local preview.
  if (!request.headers.get("oai-authenticated-user-id")) return jsonError("Sign in to Coursewise before pairing.", 401);
  const user = await userId(request);
  if (!user) return jsonError("Sign in and confirm age eligibility in Coursewise before pairing.", 401);
  let body: { code?: unknown };
  try { body = await request.json(); } catch { return jsonError("Invalid pairing request."); }
  if (typeof body.code !== "string" || !/^[a-f0-9]{48}$/.test(body.code)) return jsonError("Invalid pairing code.");
  const result = await database().prepare("UPDATE extension_pairings SET user_id=?,approved=1 WHERE code_hash=? AND expires_at>? AND consumed=0 AND approved=0")
    .bind(user, await hashSecret(body.code), Date.now()).run();
  if (!result.meta.changes) return jsonError("Pairing code expired or already used.", 403);
  return Response.json({ paired: true }, { headers: { "Cache-Control": "no-store" } });
}
