import { chatTurn, ChatError } from "@/lib/chat";
import { extensionError, extensionResponse, extensionUser, fromExtension, preflight } from "@/lib/extension";

export const OPTIONS = preflight;
type Context = { url?: string; pageTitle?: string; courseName?: string; visibleTextSummary?: string };
type CanvasItem = { kind: string; title: string; when: string };
const limits: Record<keyof Context, number> = { url: 400, pageTitle: 200, courseName: 200, visibleTextSummary: 2000 };
function withoutPrivateFeeds(value: string) {
  return value.replace(/\b(?:https?|webcal):\/\/[^\s<>"']*(?:\/feeds?\/|\.ics\b|calendar[_-]?feed)[^\s<>"']*/gi, "[private calendar link omitted]");
}
export async function POST(request: Request) {
  if (!fromExtension(request)) return extensionError(request, "Local extension chat is unavailable.", 403);
  const user = await extensionUser(request);
  if (!user) return extensionError(request, "Session expired. Pair the extension again.", 401);
  if (Number(request.headers.get("content-length") || 0) > 12_000) return extensionError(request, "Question is too large.", 413);
  let raw: string, body: Record<string, unknown>;
  try { raw = await request.text(); body = JSON.parse(raw); } catch { return extensionError(request, "Invalid question.", 400); }
  if (new TextEncoder().encode(raw).length > 12_000 || !body || typeof body !== "object" || Array.isArray(body))
    return extensionError(request, "Question is too large.", 413);
  const { courseId, question, selectedSourceIds } = body;
  if (typeof courseId !== "string" || !courseId || courseId.length > 150 ||
      typeof question !== "string" || !question.trim() || question.length > 2000 ||
      !Array.isArray(selectedSourceIds) || selectedSourceIds.length > 30 ||
      selectedSourceIds.some(id => typeof id !== "string" || id.length > 150))
    return extensionError(request, "Choose a course and enter a shorter question.", 400);
  const contextInput = body.canvasContext ?? {};
  if (!contextInput || typeof contextInput !== "object" || Array.isArray(contextInput) ||
      Object.keys(contextInput).some(key => !(key in limits))) return extensionError(request, "Canvas context is invalid.", 400);
  const context: Context = {};
  for (const key of Object.keys(limits) as (keyof Context)[]) {
    const value = (contextInput as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > limits[key]) return extensionError(request, "Canvas context is too large.", 413);
    context[key] = withoutPrivateFeeds(value.trim());
  }
  if (context.url) {
    let url: URL;
    try { url = new URL(context.url); } catch { return extensionError(request, "Invalid Canvas URL.", 400); }
    if (url.protocol !== "https:" || url.hostname !== "canvas.upenn.edu" || url.search || url.hash ||
        /\/feeds?\/|\.ics(?:$|\/)|calendar[_-]?feed/i.test(url.pathname)) return extensionError(request, "Invalid Canvas URL.", 400);
  }
  let canvasSnapshot: { grade: number | null; items: CanvasItem[] } | null = null;
  if (body.canvasSnapshot != null) {
    const input = body.canvasSnapshot as Record<string, unknown>;
    if (typeof input !== "object" || Array.isArray(input) || !Array.isArray(input.items) || input.items.length > 20 ||
        (input.grade !== null && (typeof input.grade !== "number" || !Number.isFinite(input.grade) || input.grade < 0 || input.grade > 200)))
      return extensionError(request, "Canvas overview is invalid.", 400);
    const items: CanvasItem[] = [];
    for (const item of input.items) {
      if (!item || typeof item !== "object" || Array.isArray(item) ||
          !["assignment", "assessment", "announcement", "event"].includes(item.kind) ||
          typeof item.title !== "string" || item.title.length > 180 ||
          typeof item.when !== "string" || item.when.length > 80) return extensionError(request, "Canvas overview is invalid.", 400);
      items.push({ kind: item.kind, title: withoutPrivateFeeds(item.title), when: item.when });
    }
    canvasSnapshot = { grade: input.grade as number | null, items };
  }
  try {return extensionResponse(request,await chatTurn(user,{...body,canvasContext:context,canvasSnapshot}));}
  catch(e){return extensionError(request,e instanceof ChatError?e.message:"Coursewise AI is unavailable right now.",e instanceof ChatError?e.status:503);}
}
