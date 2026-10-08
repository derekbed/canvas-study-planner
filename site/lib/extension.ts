import { database, jsonError } from "@/lib/server";

export const EXTENSION_ID = "fjflmeaiboafcffacfmlaopangaedjho";
export const EXTENSION_ORIGIN = new RegExp(`^chrome-extension://${EXTENSION_ID}$`);
export const EXTENSION_ORIGIN_URL = `chrome-extension://${EXTENSION_ID}`;
export const DEV_ORIGIN = "http://localhost:5173";
export const CODE_TTL = 5 * 60 * 1000;
export const TOKEN_TTL = 60 * 60 * 1000;

export function localOnly(request: Request) {
  const url = new URL(request.url);
  return url.protocol === "http:" && url.hostname === "localhost" && url.port === "5173";
}
export function extensionHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") || "";
  return EXTENSION_ORIGIN.test(origin) || (request.method === "GET" && !origin) ? {
    "Access-Control-Allow-Origin": EXTENSION_ORIGIN_URL,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  } : { "Cache-Control": "no-store" };
}
export function extensionResponse(request: Request, data: unknown, status = 200) {
  return Response.json(data, { status, headers: extensionHeaders(request) });
}
export function extensionError(request: Request, message: string, status: number) {
  return extensionResponse(request, { error: message }, status);
}
export function preflight(request: Request) {
  if (!localOnly(request) || !EXTENSION_ORIGIN.test(request.headers.get("origin") || "")) return jsonError("Extension unavailable.", 403);
  return new Response(null, { status: 204, headers: extensionHeaders(request) });
}
export function fromExtension(request: Request) {
  const origin = request.headers.get("origin") || "";
  // Chrome's extension service worker can omit Origin on an authenticated GET.
  // Every GET route still verifies the paired bearer token via extensionUser.
  return localOnly(request) && (EXTENSION_ORIGIN.test(origin) || (request.method === "GET" && !origin));
}
export function randomSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, "0")).join("");
}
export async function hashSecret(secret: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
export async function extensionUser(request: Request): Promise<string | null> {
  const match = /^Bearer ([a-f0-9]{48})$/.exec(request.headers.get("authorization") || "");
  if (!match) return null;
  const row = await database().prepare("SELECT user_id FROM extension_sessions WHERE token_hash=? AND revoked=0 AND expires_at>?")
    .bind(await hashSecret(match[1]), Date.now()).first<{ user_id: string }>();
  return row?.user_id || null;
}
