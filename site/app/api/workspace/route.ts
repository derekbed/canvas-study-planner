import { database, jsonError, cleanText, numberIn, now, userId, workspace } from "@/lib/server";

export async function GET(request: Request) {
  const user = userId(request); if (!user) return jsonError("Sign in to view your workspace.", 401);
  try { return Response.json(await workspace(user)); }
  catch (error) { console.error("Workspace load failed", error); return jsonError("Your workspace could not load. Please try again.", 503); }
}

export async function POST(request: Request) {
  const user = userId(request); if (!user) return jsonError("Sign in to save changes.", 401);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError("Invalid request."); }
  const action = cleanText(body.action, 40);
  const db = database(); const id = cleanText(body.id, 150);
  try {
    if (action === "course:create") {
      const name = cleanText(body.name, 120); if (!name) return jsonError("Enter a course name.");
      const created = crypto.randomUUID();
      await db.prepare("INSERT INTO courses (id,user_id,name,code,color,target_grade,grade_weights,source,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(created, user, name, cleanText(body.code, 40), cleanText(body.color, 20) || "blue", 90, "{}", "manual", now()).run();
    } else if (action === "course:update") {
      if (!id) return jsonError("Choose a course.");
      await db.prepare("UPDATE courses SET target_grade = ?, current_grade = ?, grade_weights = ? WHERE id = ? AND user_id = ?")
        .bind(numberIn(body.targetGrade, 0, 100, 90), body.currentGrade === "" || body.currentGrade == null ? null : numberIn(body.currentGrade, 0, 100, 0),
          typeof body.gradeWeights === "object" ? JSON.stringify(body.gradeWeights).slice(0, 3000) : "{}", id, user).run();
    } else if (action === "event:create") {
      const title = cleanText(body.title, 180), dueAt = cleanText(body.dueAt, 80), courseId = cleanText(body.courseId, 150);
      if (!title || !dueAt || !Number.isFinite(Date.parse(dueAt))) return jsonError("Enter a title and valid date.");
      if (courseId) { const owned = await db.prepare("SELECT id FROM courses WHERE id = ? AND user_id = ?").bind(courseId, user).first(); if (!owned) return jsonError("Course not found."); }
      await db.prepare("INSERT INTO events (id,user_id,course_id,title,description,due_at,kind,points_possible,status,source,estimated_minutes,grade_group,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), user, courseId || null, title, cleanText(body.description, 5000), new Date(dueAt).toISOString(), cleanText(body.kind, 30) || "assignment",
          body.pointsPossible === "" || body.pointsPossible == null ? null : numberIn(body.pointsPossible, 0, 100000, 0), "upcoming", "manual", numberIn(body.estimatedMinutes, 15, 600, 60), cleanText(body.gradeGroup, 80), now()).run();
    } else if (action === "event:update") {
      if (!id) return jsonError("Choose an assignment.");
      const status = cleanText(body.status, 20);
      if (!["upcoming", "done", "missing"].includes(status)) return jsonError("Invalid status.");
      await db.prepare("UPDATE events SET status = ?, points_earned = ? WHERE id = ? AND user_id = ?")
        .bind(status, body.pointsEarned === "" || body.pointsEarned == null ? null : numberIn(body.pointsEarned, 0, 100000, 0), id, user).run();
    } else if (action === "settings:update") {
      const days = Array.isArray(body.availableDays) ? body.availableDays.filter(v => Number.isInteger(v) && v >= 0 && v <= 6) : [1,2,3,4,5];
      await db.prepare("INSERT INTO settings (user_id,available_days,hours_per_week,reminder_hours) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET available_days=excluded.available_days,hours_per_week=excluded.hours_per_week,reminder_hours=excluded.reminder_hours")
        .bind(user, JSON.stringify(days), numberIn(body.hoursPerWeek, 1, 40, 8), numberIn(body.reminderHours, 1, 168, 24)).run();
    } else if (action === "plan:save") {
      const blocks = Array.isArray(body.blocks) ? body.blocks.slice(0, 50) : [];
      const statements = [db.prepare("DELETE FROM study_blocks WHERE user_id = ? AND status = 'planned'").bind(user)];
      for (const raw of blocks) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as Record<string, unknown>; const courseId = cleanText(item.courseId, 150), eventId = cleanText(item.eventId, 150), startsAt = cleanText(item.startsAt, 80);
        if (!Number.isFinite(Date.parse(startsAt))) continue;
        statements.push(db.prepare("INSERT INTO study_blocks (id,user_id,course_id,event_id,starts_at,minutes,status) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), user, courseId || null, eventId || null, new Date(startsAt).toISOString(), numberIn(item.minutes, 15, 240, 60), "planned"));
      }
      await db.batch(statements);
    } else if (action === "plan:complete") {
      await db.prepare("UPDATE study_blocks SET status='done' WHERE id=? AND user_id=?").bind(id, user).run();
    } else {
      return jsonError("Unknown action.");
    }
    return Response.json(await workspace(user));
  } catch (error) { console.error("Workspace save failed", error); return jsonError("Your changes could not be saved. Please try again.", 503); }
}
