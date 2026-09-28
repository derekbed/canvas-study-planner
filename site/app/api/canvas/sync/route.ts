import { syncCanvas } from "@/lib/canvas";
import { jsonError, userId, workspace } from "@/lib/server";

export async function POST(request: Request) {
  const user = userId(request); if (!user) return jsonError("Sign in first.", 401);
  try { await syncCanvas(user); return Response.json(await workspace(user)); }
  catch (error) { console.error("Canvas sync failed", error); return jsonError(error instanceof Error ? error.message : "Canvas could not sync.", 503); }
}
