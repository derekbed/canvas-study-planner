import { database, jsonError, now, userId, workspace } from "@/lib/server";
import { parseIcsCalendar } from "@/lib/ics";

function cleanFeedUrl(value: unknown) {
  if (typeof value !== "string") return null;
  let parsed: URL;
  try { parsed = new URL(value.trim()); } catch { return null; }
  if (parsed.protocol !== "https:" || !parsed.pathname.endsWith(".ics")) return null;
  return parsed.toString();
}

export async function POST(request: Request) {
  const user = userId(request);
  if (!user) return jsonError("Sign in to import a calendar feed.", 401);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError("Invalid request."); }
  const feedUrl = cleanFeedUrl(body.feedUrl);
  if (!feedUrl) return jsonError("Paste a valid Canvas calendar feed link ending in .ics.");

  try {
    const response = await fetch(feedUrl, { headers: { Accept: "text/calendar,text/plain,*/*" } });
    if (!response.ok) return jsonError(`Canvas returned ${response.status}. Check that the feed link is current.`, 502);
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (!contentType.includes("calendar") && !text.includes("BEGIN:VCALENDAR")) return jsonError("That link did not return a calendar feed.");

    const entries = parseIcsCalendar(text).slice(0, 500);
    if (!entries.length) return jsonError("No calendar events were found in that feed.");

    const db = database();
    const created = now();
    await db.batch([
      db.prepare("DELETE FROM events WHERE user_id = ? AND source = 'demo'").bind(user),
      db.prepare("DELETE FROM courses WHERE user_id = ? AND source = 'demo'").bind(user),
    ]);

    const statements = entries.map(entry => db.prepare(
      "INSERT INTO events (id,user_id,course_id,canvas_id,title,description,due_at,kind,status,source,url,estimated_minutes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,canvas_id) DO UPDATE SET title=excluded.title,description=excluded.description,due_at=excluded.due_at,url=excluded.url"
    ).bind(
      `ics-${user}-${crypto.randomUUID()}`,
      user,
      null,
      `ics:${entry.uid}`.slice(0, 500),
      entry.title.slice(0, 180),
      entry.description.slice(0, 10000),
      entry.startsAt,
      "event",
      Date.parse(entry.startsAt) < Date.now() ? "done" : "upcoming",
      "ics",
      entry.url,
      30,
      created,
    ));
    for (let i = 0; i < statements.length; i += 80) await db.batch(statements.slice(i, i + 80));

    const next = await workspace(user);
    return Response.json({ ...next, imported: entries.length });
  } catch (error) {
    console.error("Calendar feed import failed", error);
    return jsonError("The calendar feed could not be imported. Please try again.", 503);
  }
}
