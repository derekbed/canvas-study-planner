import {chatTurn,ChatError} from "@/lib/chat";
import { database, setting } from "@/lib/server";
import type { Course } from "@/lib/server";
import { extensionError, extensionResponse, extensionUser, fromExtension, preflight } from "@/lib/extension";
import { matchSavedCourse, validateStudyBody } from "@/lib/extension-study";
export const OPTIONS = preflight;
export async function POST(request: Request) {
  if (!fromExtension(request)) return extensionError(request, "Local extension study is unavailable.", 403);
  const user = await extensionUser(request);
  if (!user) return extensionError(request, "Session expired. Pair the extension again.", 401);
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > 12_000) return extensionError(request, "Page context is too large. Refresh or clear it and try again.", 413);
  let raw: string;
  try { raw = await request.text(); } catch { return extensionError(request, "Could not read the request.", 400); }
  const validated = validateStudyBody(raw);
  if (!validated) return extensionError(request, "Question or page context is invalid or too large.", 413);
  const apiKey = setting("OPENAI_API_KEY");
  if (!apiKey) return extensionError(request, "Coursewise AI is unavailable. Configure OPENAI_API_KEY on the server.", 503);
  const db = database();
  const pref = await db.prepare("SELECT value FROM preferences WHERE user_id=?").bind(user).first<{ value: string }>();
  let consent = false;
  try { consent = Boolean(JSON.parse(pref?.value || "{}").consent); } catch { /* invalid preference means no consent */ }
  if (!consent) return extensionError(request, "Enable AI excerpt consent in Coursewise Data & privacy first.", 403);
  const courses = (await db.prepare("SELECT * FROM courses WHERE user_id=?").bind(user).all<Course>()).results;
  const course = matchSavedCourse(courses, validated.canvasContext);
  const body = JSON.parse(raw) as Record<string,unknown>;
  try { return extensionResponse(request,await chatTurn(user,{question:validated.question,courseId:course?.id||"",materialIds:course?undefined:[],conversationId:body.conversationId,requestId:body.requestId,canvasContext:validated.canvasContext})); }
  catch(e){return extensionError(request,e instanceof ChatError?e.message:"Coursewise AI is unavailable right now.",e instanceof ChatError?e.status:503);}
}
