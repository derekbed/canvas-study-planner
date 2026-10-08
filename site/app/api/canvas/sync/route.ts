import { syncCanvas } from "@/lib/canvas";
import { jsonError, userId, workspace } from "@/lib/server";

export async function POST(request: Request) {
  const user = userId(request); if (!user) return jsonError("Sign in first.", 401);
  try { await syncCanvas(user); return Response.json(await workspace(user)); }
  catch { return jsonError("Canvas could not sync. Reconnect if access has expired, or try again later. Your manual courses and dates are kept.", 503); }
}
