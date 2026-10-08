import { database } from "@/lib/server";
import { extensionError, extensionResponse, extensionUser, fromExtension, preflight } from "@/lib/extension";

export const OPTIONS = preflight;
export async function GET(request: Request) {
  if (!fromExtension(request)) return extensionError(request, "Local preferences are unavailable.", 403);
  const user = await extensionUser(request); if (!user) return extensionError(request, "Session expired. Pair the extension again.", 401);
  const row = await database().prepare("SELECT value FROM preferences WHERE user_id=?").bind(user).first<{ value: string }>();
  let value: Record<string, unknown> = {}; try { value = JSON.parse(row?.value || "{}"); } catch { /* defaults */ }
  return extensionResponse(request, {
    canvasBackground: typeof value.canvasBackground === "string" && /^#[0-9a-f]{6}$/i.test(value.canvasBackground) ? value.canvasBackground : "#f7faf9",
    canvasThemeMode: ["light", "dark", "system"].includes(String(value.canvasThemeMode)) ? value.canvasThemeMode : "light"
  });
}
export async function POST(request: Request) {
  if (!fromExtension(request)) return extensionError(request, "Local preferences are unavailable.", 403);
  const user = await extensionUser(request); if (!user) return extensionError(request, "Session expired. Pair the extension again.", 401);
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return extensionError(request, "Invalid preferences.", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return extensionError(request, "Invalid preferences.", 400);
  const updates: Record<string, unknown> = {};
  if (body.canvasBackground !== undefined) {
    if (typeof body.canvasBackground !== "string" || !/^#[0-9a-f]{6}$/i.test(body.canvasBackground)) return extensionError(request, "Choose a valid background color.", 400);
    updates.canvasBackground = body.canvasBackground;
  }
  if (body.canvasThemeMode !== undefined) {
    if (typeof body.canvasThemeMode !== "string" || !["light", "dark", "system"].includes(body.canvasThemeMode)) return extensionError(request, "Choose light, dark, or system appearance.", 400);
    updates.canvasThemeMode = body.canvasThemeMode;
  }
  if (!Object.keys(updates).length) return extensionError(request, "No valid preference was provided.", 400);
  const value = await database().prepare("SELECT value FROM preferences WHERE user_id=?").bind(user).first<{ value: string }>();
  let old: Record<string, unknown> = {}; try { old = JSON.parse(value?.value || "{}"); } catch { /* defaults */ }
  const next = { ...old, ...updates };
  await database().prepare("INSERT INTO preferences (user_id,value) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value").bind(user, JSON.stringify(next)).run();
  return extensionResponse(request, {
    canvasBackground: typeof next.canvasBackground === "string" && /^#[0-9a-f]{6}$/i.test(next.canvasBackground) ? next.canvasBackground : "#f7faf9",
    canvasThemeMode: ["light", "dark", "system"].includes(String(next.canvasThemeMode)) ? next.canvasThemeMode : "light"
  });
}
