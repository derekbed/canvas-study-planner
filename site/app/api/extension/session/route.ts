import { database } from "@/lib/server";
import { extensionError, extensionResponse, fromExtension, hashSecret, preflight } from "@/lib/extension";
export const OPTIONS = preflight;
export async function POST(request: Request) {
  if (!fromExtension(request)) return extensionError(request, "Local extension session is unavailable.", 403);
  const match = /^Bearer ([a-f0-9]{48})$/.exec(request.headers.get("authorization") || "");
  if (!match) return extensionError(request, "Pair the extension again.", 401);
  await database().prepare("UPDATE extension_sessions SET revoked=1 WHERE token_hash=?").bind(await hashSecret(match[1])).run();
  return extensionResponse(request, { revoked: true });
}
