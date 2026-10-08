import { canvasConfig, encrypt, syncCanvas } from "@/lib/canvas";
import { database, userId } from "@/lib/server";

export async function GET(request: Request) {
  const config = canvasConfig(), user = await userId(request), url = new URL(request.url);
  const cookie = request.headers.get("Cookie")?.match(/(?:^|; )canvas_oauth_state=([^;]+)/)?.[1];
  const state = url.searchParams.get("state"), code = url.searchParams.get("code");
  if (!config || !user || !cookie || !state || cookie !== state || !code) return new Response("Canvas connection could not be verified.", { status: 400 });
  const callback = new URL("/api/canvas/callback", request.url).toString();
  try {
    const tokenResponse = await fetch(`${config.base}/login/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: config.id, client_secret: config.secret, redirect_uri: callback, code }) });
    if (!tokenResponse.ok) throw new Error(`Canvas token request failed: ${tokenResponse.status}`);
    const token = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in?: number };
    await database().prepare("INSERT INTO canvas_connections (user_id,base_url,access_token,refresh_token,expires_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET base_url=excluded.base_url,access_token=excluded.access_token,refresh_token=excluded.refresh_token,expires_at=excluded.expires_at")
      .bind(user, config.base, await encrypt(token.access_token), await encrypt(token.refresh_token || ""), token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null).run();
    await syncCanvas(user);
    const response = Response.redirect(new URL("/?canvas=connected", request.url).toString(), 302);
    response.headers.append("Set-Cookie", "canvas_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/canvas/callback; Max-Age=0");
    return response;
  } catch { return Response.redirect(new URL("/?canvas=error", request.url).toString(), 302); }
}
