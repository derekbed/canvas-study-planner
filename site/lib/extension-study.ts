export type CanvasContext = {
  url?: string; pageTitle?: string; courseName?: string; courseCode?: string;
  assignmentTitle?: string; dueText?: string; pointsText?: string; instructions?: string;
};
const limits: Record<keyof CanvasContext, number> = {
  url: 400, pageTitle: 200, courseName: 200, courseCode: 80,
  assignmentTitle: 200, dueText: 160, pointsText: 80, instructions: 8000,
};
export function validateStudyBody(raw: string): { question: string; canvasContext: CanvasContext } | null {
  if (new TextEncoder().encode(raw).length > 12_000) return null;
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return null; }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.question !== "string" || !body.question.trim() || body.question.length > 2000 ||
      !body.canvasContext || typeof body.canvasContext !== "object" || Array.isArray(body.canvasContext)) return null;
  const input = body.canvasContext as Record<string, unknown>, canvasContext: CanvasContext = {};
  if (Object.keys(input).some(key => !(key in limits))) return null;
  for (const key of Object.keys(limits) as (keyof CanvasContext)[]) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > limits[key]) return null;
    canvasContext[key] = value.trim();
  }
  if (canvasContext.url) {
    let url: URL;
    try { url = new URL(canvasContext.url); } catch { return null; }
    if (url.protocol !== "https:" || url.hostname !== "canvas.upenn.edu" || url.search || url.hash ||
        /\/feeds?\/|\.ics(?:$|\/)|calendar[_-]?feed/i.test(url.pathname)) return null;
  }
  return { question: body.question.trim(), canvasContext };
}
export function matchSavedCourse<T extends { id: string; canvas_id: string | null; name: string; code: string }>(courses: T[], context: CanvasContext): T | null {
  const id = context.url?.match(/\/courses\/(\d+)(?:\/|$)/)?.[1];
  if (id) {
    const byId = courses.find(course => course.canvas_id === id);
    if (byId) return byId;
  }
  const norm = (value: string) => value.trim().toLocaleLowerCase();
  if (context.courseCode) {
    const byCode = courses.find(course => course.code && norm(course.code) === norm(context.courseCode!));
    if (byCode) return byCode;
  }
  if (context.courseName) return courses.find(course => norm(course.name) === norm(context.courseName!)) || null;
  return null;
}
