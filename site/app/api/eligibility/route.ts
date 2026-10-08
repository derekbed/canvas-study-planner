import { ageGateRequired, authenticatedUserId, database, jsonError } from "@/lib/server";

export async function GET(request: Request) {
  const user = authenticatedUserId(request);
  if (!user) return jsonError("Sign in first.", 401);
  const required = ageGateRequired();
  if (!required) return Response.json({ required: false, accepted: true }, { headers: { "Cache-Control": "no-store" } });
  const row = await database().prepare("SELECT value FROM preferences WHERE user_id=?").bind(user).first<{ value: string }>();
  let accepted = false;
  try { accepted = Boolean(JSON.parse(row?.value || "{}").age13ConfirmedAt); } catch { /* invalid preferences fail closed */ }
  return Response.json({ required: true, accepted }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = authenticatedUserId(request);
  if (!user) return jsonError("Sign in first.", 401);
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) return jsonError("Open Coursewise to confirm eligibility.", 403);
  let body: { atLeast13?: unknown };
  try { body = await request.json(); } catch { return jsonError("Invalid eligibility confirmation."); }
  if (!body || typeof body !== "object" || body.atLeast13 !== true)
    return jsonError("Coursewise is available only to people age 13 or older.", 403);
  const db = database();
  const row = await db.prepare("SELECT value FROM preferences WHERE user_id=?").bind(user).first<{ value: string }>();
  let old: Record<string, unknown> = {};
  try { old = JSON.parse(row?.value || "{}"); } catch { /* reset invalid preferences */ }
  const next = { ...old, initialized: true, age13ConfirmedAt: new Date().toISOString() };
  await db.prepare("INSERT INTO preferences (user_id,value) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value")
    .bind(user, JSON.stringify(next)).run();
  return Response.json({ required: true, accepted: true }, { headers: { "Cache-Control": "no-store" } });
}
