import { canvasConfig } from "@/lib/canvas";
import { jsonError, userId } from "@/lib/server";

export async function GET(request: Request) {
  if (!await userId(request)) return jsonError("Sign in first.", 401);
  const config = canvasConfig(); if (!config) return jsonError("Canvas connection is not configured for this school yet.", 503);
  const callback = new URL("/api/canvas/callback", request.url).toString();
  const state = crypto.randomUUID();
  const url = new URL("/login/oauth2/auth", config.base);
  url.searchParams.set("client_id", config.id); url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", callback); url.searchParams.set("state", state);
  const response = Response.redirect(url.toString(), 302);
  response.headers.append("Set-Cookie", `canvas_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/canvas/callback; Max-Age=600`);
  return response;
}
