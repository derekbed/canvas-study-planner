(function (root) {
  "use strict";
  const ORIGIN = "https://canvas.upenn.edu";
  const courseId = value => /^\d+$/.test(String(value ?? "")) ? String(value) : "";
  const text = (value, max = 160) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

  function safeCanvasLink(value, fallback = "") {
    try {
      const url = new URL(value, ORIGIN);
      if (url.origin !== ORIGIN || !/^\/courses\/\d+(?:\/|$)/.test(url.pathname) ||
          /\/feeds?\/|\.ics(?:$|\/)/i.test(url.pathname)) return fallback;
      return `${url.origin}${url.pathname}`;
    } catch { return fallback; }
  }

  function gradeFor(course) {
    const enrollments = Array.isArray(course?.enrollments) ? course.enrollments : [];
    const student = enrollments.find(item => item?.type === "StudentEnrollment" || item?.enrollment_type === "student");
    if (!student) return { score: null, letter: "", label: "Grade unavailable" };
    const raw = student.computed_current_score ?? student.grades?.current_score;
    const score = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : null;
    if (score === null || !Number.isFinite(score) || score < 0 || score > 200) return { score: null, letter: "", label: "Grade unavailable" };
    return { score: Math.round(score * 10) / 10,
      letter: text(student.computed_current_grade ?? student.grades?.current_grade, 12), label: "Current Canvas grade" };
  }

  function assignmentFor(raw, id, now = Date.now()) {
    const item = workFor(raw, id, now);
    return item && Date.parse(item.dueAt) >= now ? item : null;
  }

  function workFor(raw, id, now = Date.now()) {
    if (raw?.published === false) return null;
    const submission = raw?.submission;
    if (submission?.submitted_at || ["submitted", "graded", "complete", "pending_review"].includes(submission?.workflow_state)) return null;
    const due = typeof raw?.due_at === "string" ? Date.parse(raw.due_at) : NaN;
    if (!Number.isFinite(due) || due < now - 14 * 86400000) return null;
    const title = text(raw?.name ?? raw?.title, 180);
    if (!title) return null;
    const course = courseId(id);
    const assignment = courseId(raw?.id);
    if (!course || !assignment) return null;
    const fallback = `${ORIGIN}/courses/${course}/assignments/${assignment}`;
    const points = typeof raw?.points_possible === "number" && Number.isFinite(raw.points_possible) && raw.points_possible >= 0
      ? raw.points_possible : null;
    const types = Array.isArray(raw?.submission_types) ? raw.submission_types : [];
    const assessment = !!raw?.quiz_id || types.includes("online_quiz") ||
      /\b(quiz|exam|midterm|final|test)\b/i.test(title);
    return { id: assignment, courseId: course, title, dueAt: new Date(due).toISOString(), points,
      missing: submission?.missing === true, late: submission?.late === true,
      kind: assessment ? "assessment" : "assignment", overdue: due < now,
      url: safeCanvasLink(raw?.html_url, fallback) };
  }

  function upcomingAssignments(rows, id, now = Date.now(), limit = 3) {
    if (!Array.isArray(rows)) return [];
    const seen = new Set();
    return rows.map(raw => assignmentFor(raw, id, now)).filter(item => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id); return true;
    }).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)).slice(0, limit);
  }

  function organizeWork(rows, id, now = Date.now(), limit = 80) {
    if (!Array.isArray(rows)) return [];
    const seen = new Set();
    return rows.map(raw => workFor(raw, id, now)).filter(item => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id); return true;
    }).sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return a.overdue ? Date.parse(b.dueAt) - Date.parse(a.dueAt) : Date.parse(a.dueAt) - Date.parse(b.dueAt);
    }).slice(0, limit);
  }

  function announcementFor(raw, id, now = Date.now()) {
    const course = courseId(id), announcement = courseId(raw?.id);
    const context = raw?.context_code;
    if (!course || !announcement || context !== `course_${course}` || raw?.published === false) return null;
    const title = text(raw?.title, 180);
    const posted = Date.parse(raw?.posted_at || raw?.created_at || "");
    if (!title || !Number.isFinite(posted) || posted > now) return null;
    const fallback = `${ORIGIN}/courses/${course}/discussion_topics/${announcement}`;
    return { id: announcement, courseId: course, title, postedAt: new Date(posted).toISOString(),
      url: safeCanvasLink(raw?.html_url, fallback) };
  }

  function organizeAnnouncements(rows, id, now = Date.now(), limit = 30) {
    if (!Array.isArray(rows)) return [];
    const seen = new Set();
    return rows.map(raw => announcementFor(raw, id, now)).filter(item => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id); return true;
    }).sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt)).slice(0, limit);
  }

  function courseFor(raw) {
    const id = courseId(raw?.id);
    if (!id) return null;
    return { id, name: text(raw?.name, 180) || "Canvas course", code: text(raw?.course_code, 90),
      grade: gradeFor(raw), url: `${ORIGIN}/courses/${id}` };
  }

  function withEnrollmentGrade(course, enrollment) {
    if (!course || course.grade.score !== null || courseId(enrollment?.course_id) !== course.id) return course;
    const grade = gradeFor({ enrollments: [enrollment] });
    return grade.score === null ? course : { ...course, grade };
  }

  const api = { ORIGIN, courseId, safeCanvasLink, gradeFor, courseFor, withEnrollmentGrade,
    assignmentFor, upcomingAssignments, workFor, organizeWork, announcementFor, organizeAnnouncements };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CoursewiseInsightsModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
