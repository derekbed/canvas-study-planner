import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { calculate, WEIGHTS } = require("../course-health.js");
const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/course-health.json", import.meta.url), "utf8"));
const base = { courseId: fixture.courseId, announcements: [], grade: { score: null },
  available: { work: true, announcements: true }, sourceUpdatedAt: fixture.sourceUpdatedAt, now: Date.parse(fixture.now) };

test("healthy and empty course is calm without inventing a grade trend", () => {
  const result = calculate({ ...base, work: fixture.healthy });
  assert.equal(result.status, "on-track");
  assert.equal(result.score, 0);
  assert.equal(result.signals.grades.status, "insufficient-data");
  assert.equal(result.signals.grades.trend, null);
});
test("recent overdue work is urgent and receives the first action", () => {
  const result = calculate({ ...base, work: fixture.overdue,
    announcements: [{ id: "8", courseId: "123", title: "Update", postedAt: fixture.now, url: "https://canvas.upenn.edu/courses/123/discussion_topics/8" }] });
  assert.equal(result.status, "needs-attention");
  assert.equal(result.signals.deadlines.overdue, 1);
  assert.equal(result.actions[0].reason, "Overdue assignment");
  assert.equal(result.actions[1].reason, "Recent announcement");
});
test("clustered deadlines prompt watch and show the next deadline", () => {
  const result = calculate({ ...base, work: fixture.clustered });
  assert.equal(result.status, "watch");
  assert.equal(result.signals.deadlines.count, 3);
  assert.match(result.phrase, /3 deadlines/);
  assert.equal(result.actions[0].href, fixture.clustered[0].url);
});
test("unavailable assignments and stale sync are represented honestly", () => {
  const unavailable = calculate({ ...base, work: undefined, available: { work: false, announcements: true } });
  assert.equal(unavailable.status, "limited-data");
  assert.equal(unavailable.confidence, "partial");
  const stale = calculate({ ...base, work: [], sourceUpdatedAt: "2026-10-04T12:00:00Z" });
  assert.equal(stale.stale, true);
  assert.equal(stale.status, "watch");
  assert.match(stale.summary, /out of date/);
});
test("missing submissions are urgent and external links are not actions", () => {
  const work = [{ ...fixture.clustered[0], missing: true, url: "https://example.org/steal" }];
  const result = calculate({ ...base, work });
  assert.equal(result.status, "needs-attention");
  assert.equal(result.signals.submissions.missing, 1);
  assert.equal(result.actions.length, 0);
  const linked = calculate({ ...base, work: [{ ...fixture.clustered[0], missing: true }] });
  assert.equal(linked.actions[0].reason, "Canvas marked this submission missing");
});
test("scores stay within documented weights and announcements respect local read state", () => {
  const announcements = Array.from({ length: 10 }, (_, index) => ({ id: String(index), courseId: "123", title: "News", postedAt: fixture.now, url: `https://canvas.upenn.edu/courses/123/discussion_topics/${index}` }));
  const result = calculate({ ...base, work: Array.from({ length: 8 }, (_, index) => ({ ...fixture.overdue[0], id: String(index), missing: true })), announcements });
  assert.ok(result.score <= Object.values(WEIGHTS).reduce((a, b) => a + b, 0));
  const read = calculate({ ...base, work: [], announcements, read: announcements.map(item => `123:${item.id}`) });
  assert.equal(read.signals.announcements.unread, 0);
});
test("watch threshold starts at twelve points of recent announcements", () => {
  const news = Array.from({ length: 4 }, (_, index) => ({ id: String(index), courseId: "123", title: `Update ${index}`,
    postedAt: fixture.now, url: `https://canvas.upenn.edu/courses/123/discussion_topics/${index}` }));
  assert.equal(calculate({ ...base, work: [], announcements: news.slice(0, 3) }).status, "on-track");
  const watch = calculate({ ...base, work: [], announcements: news });
  assert.equal(watch.score, 12);
  assert.equal(watch.status, "watch");
});
test("future and cross-course announcements do not become actions", () => {
  const announcements = [
    { id: "1", courseId: "123", title: "Future", postedAt: "2026-10-08T12:00:00Z", url: "https://canvas.upenn.edu/courses/123/discussion_topics/1" },
    { id: "2", courseId: "999", title: "Other course", postedAt: fixture.now, url: "https://canvas.upenn.edu/courses/999/discussion_topics/2" }
  ];
  const result = calculate({ ...base, work: [], announcements });
  assert.equal(result.signals.announcements.unread, 0);
  assert.equal(result.actions.length, 0);
});
