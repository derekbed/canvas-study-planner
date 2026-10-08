import { database } from "@/lib/server";
import { CODE_TTL, extensionError, extensionResponse, fromExtension, hashSecret, preflight, randomSecret } from "@/lib/extension";
export const OPTIONS = preflight;
export async function POST(request: Request) {
  if (!fromExtension(request)) return extensionError(request, "Local extension pairing is unavailable.", 403);
  const code = randomSecret();
  await database().prepare("INSERT INTO extension_pairings (code_hash,expires_at) VALUES (?,?)").bind(await hashSecret(code), Date.now() + CODE_TTL).run();
  return extensionResponse(request, { code, expiresInSeconds: CODE_TTL / 1000 });
}
