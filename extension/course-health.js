(function (root) {
  "use strict";
  // Maximum contribution: deadlines 30, submissions 30, announcements 15,
  // grades 20, and stale/incomplete data 5. Thresholds are deliberately calm.
  const WEIGHTS = Object.freeze({ deadlines: 30, submissions: 30, announcements: 15, grades: 20, confidence: 5 });
  const DAY = 86400000;
  const safeDate = value => { const time = Date.parse(value || ""); return Number.isFinite(time) ? time : null; };
  const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const safeLink = (value, id) => {
    try {
      const url = new URL(value);
      return url.origin === "https://canvas.upenn.edu" && url.pathname.startsWith(`/courses/${id}/`) &&
        !/\/feeds?\/|\.ics(?:$|\/)/i.test(url.pathname) ? url.origin + url.pathname : "";
    } catch { return ""; }
  };

  function calculate({ courseId, work, announcements, grade, sourceUpdatedAt, available = {}, read = [], now = Date.now() }) {
    const id = String(courseId || "");
    const hasWork = available.work === true && Array.isArray(work);
    const hasAnnouncements = available.announcements === true && Array.isArray(announcements);
    const unread = new Set(read);
    const validWork = hasWork ? work.filter(item => item?.courseId === id && safeDate(item.dueAt) !== null) : [];
    const overdue = validWork.filter(item => safeDate(item.dueAt) < now);
    const next48 = validWork.filter(item => safeDate(item.dueAt) >= now && safeDate(item.dueAt) <= now + 2 * DAY);
    const week = validWork.filter(item => safeDate(item.dueAt) >= now && safeDate(item.dueAt) <= now + 7 * DAY);
    const fortnight = validWork.filter(item => safeDate(item.dueAt) > now + 7 * DAY && safeDate(item.dueAt) <= now + 14 * DAY);
    const missing = validWork.filter(item => item.missing === true);
    const late = validWork.filter(item => item.late === true);
    const deadlineScore = Math.min(WEIGHTS.deadlines, overdue.length * 12 + next48.length * 5 + Math.max(0, week.length - 2) * 3 + Math.max(0, fortnight.length - 3) * 2);
    const submissionScore = Math.min(WEIGHTS.submissions, missing.length * 15 + late.length * 5 + next48.length * 2);
    const recentUnread = hasAnnouncements ? announcements.filter(item => item?.courseId === id && !unread.has(`${id}:${item.id}`) &&
      safeDate(item.postedAt) !== null && safeDate(item.postedAt) <= now && now - safeDate(item.postedAt) <= 7 * DAY) : [];
    const announcementScore = Math.min(WEIGHTS.announcements, recentUnread.length * 3);
    const sync = safeDate(sourceUpdatedAt);
    const stale = sync === null || now - sync > 24 * 60 * 60 * 1000;
    const confidence = !hasWork && !hasAnnouncements ? "low" : stale || !hasWork || !hasAnnouncements ? "partial" : "good";
    const dataScore = stale || !hasWork || !hasAnnouncements ? WEIGHTS.confidence : 0;
    const score = deadlineScore + submissionScore + announcementScore + dataScore;
    const urgent = overdue.length > 0 || missing.length > 0;
    const status = !hasWork ? "limited-data" : urgent || score >= 30 ? "needs-attention" : score >= 12 || confidence !== "good" ? "watch" : "on-track";
    const next = [...validWork].filter(item => safeDate(item.dueAt) >= now).sort((a, b) => safeDate(a.dueAt) - safeDate(b.dueAt))[0];
    const actions = [];
    const action = (item, label, reason, priority) => {
      const href = safeLink(item.url, id);
      if (href) actions.push({ id: `${item.kind || "item"}:${item.id}`, label, reason, href, priority });
    };
    [...overdue].sort((a, b) => safeDate(b.dueAt) - safeDate(a.dueAt)).forEach(item => action(item, `Open ${item.title}`, "Overdue assignment", 0));
    missing.filter(item => !overdue.includes(item)).forEach(item => action(item, `Open ${item.title}`, "Canvas marked this submission missing", 0.5));
    if (!overdue.length && !missing.length && next) action(next, `Open ${next.title}`, next48.includes(next) ? "Due within 48 hours" : "Next deadline", 1);
    if (recentUnread.length) action(recentUnread[0], `Read ${recentUnread[0].title}`, "Recent announcement", 2);
    actions.sort((a, b) => a.priority - b.priority);
    const phrase = overdue.length ? plural(overdue.length, "overdue assignment") :
      missing.length ? plural(missing.length, "missing submission") :
      week.length ? `${plural(week.length, "deadline")} in the next 7 days` :
      !hasWork ? "Assignments unavailable" : !sync ? "Sync time unavailable" : "No upcoming deadlines found";
    const summary = status === "limited-data" ? "Assignments are unavailable, so this course cannot be assessed yet." :
      overdue.length ? `${plural(overdue.length, "assignment")} overdue in the available data${stale ? "; refresh to confirm" : " and ready to review"}.` :
      missing.length ? `${plural(missing.length, "submission")} marked missing by Canvas${stale ? "; refresh to confirm" : ""}.` :
      stale ? "This summary may be out of date; refresh Canvas data before relying on it." :
      week.length >= 3 ? `${plural(week.length, "deadline")} coming up in seven days.` :
      status === "watch" ? "Some course information is unavailable or there are several upcoming tasks." :
      "No immediate issue found in the available Canvas data.";
    return {
      courseId: id, status, score, confidence, summary, phrase,
      urgentCount: new Set([...overdue, ...missing].map(item => item.id)).size,
      signals: {
        deadlines: { status: !hasWork ? "unavailable" : overdue.length ? "urgent" : week.length >= 3 ? "watch" : "clear", count: week.length, overdue: overdue.length, next: next?.dueAt || null, windowLabel: "Next 7 days" },
        submissions: { status: !hasWork ? "unavailable" : missing.length ? "urgent" : next48.length ? "watch" : "clear", missing: missing.length, late: late.length, unsubmitted: validWork.length },
        announcements: { status: !hasAnnouncements ? "unavailable" : recentUnread.length ? "watch" : "clear", unread: recentUnread.length, recent: recentUnread.length, latest: recentUnread[0]?.postedAt || null },
        grades: { status: "insufficient-data", average: grade?.score ?? null, trend: null, sampleSize: 0 }
      },
      actions, generatedAt: new Date(now).toISOString(), sourceUpdatedAt: sync === null ? null : new Date(sync).toISOString(), stale
    };
  }
  const api = { WEIGHTS, calculate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CoursewiseCourseHealth = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
