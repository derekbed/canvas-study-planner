import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const model = require("../insights-model.js");
const fixture = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../fixtures/insights.json"), "utf8"));

test("student Canvas score is displayed without inventing a hidden grade", () => {
  const scored = model.courseFor(fixture.courses[0]);
  assert.equal(scored.grade.score, 87.4);
  assert.equal(scored.grade.letter, "B+");
  assert.equal(model.courseFor(fixture.courses[1]).grade.score, null);
  assert.equal(model.withEnrollmentGrade(model.courseFor(fixture.courses[1]), fixture.enrollments[0]).grade.score, 92.5);
  assert.equal(model.withEnrollmentGrade(model.courseFor(fixture.courses[0]), fixture.enrollments[0]).grade.score, 87.4);
  assert.equal(model.gradeFor({ enrollments: [{ type: "StudentEnrollment", computed_current_score: null }] }).label, "Grade unavailable");
  assert.equal(model.gradeFor({ enrollments: [{ type: "TeacherEnrollment", computed_current_score: 91 }] }).score, null);
});

test("nearest unsubmitted deadline is first and links stay on Canvas", () => {
  const list = model.upcomingAssignments(fixture.assignments, "123", Date.parse("2026-10-06T12:00:00Z"));
  assert.deepEqual(list.map(item => item.title), ["Short quiz", "Private link", "Problem Set 4"]);
  assert.equal(list[1].url, "https://canvas.upenn.edu/courses/123/assignments/6");
  assert.equal(model.safeCanvasLink("https://canvas.upenn.edu/feeds/calendars/private.ics"), "");
  assert.equal(model.safeCanvasLink("https://example.edu/courses/123/assignments/1"), "");
});

test("past, unpublished, graded, and submitted assignments are excluded", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  const future = "2026-10-10T12:00:00Z";
  for (const extra of [
    { due_at: "2026-10-01T12:00:00Z" }, { published: false },
    { submission: { workflow_state: "graded" } }, { submission: { submitted_at: "2026-10-06T10:00:00Z" } }
  ]) {
    assert.equal(model.assignmentFor({ id: 1, name: "Skip", due_at: future, published: true, ...extra }, "123", now), null);
  }
  assert.equal(model.assignmentFor({ id: 2, name: "Opens later", due_at: future, published: true, locked_for_user: true }, "123", now)?.title, "Opens later");
});

test("another student's submission does not hide this student's deadline", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  const due = "2026-10-12T23:59:00Z";
  const item = model.assignmentFor({ id: 14923868, name: "Course Project (Short Video)", due_at: due,
    has_submitted_submissions: true, submission: { workflow_state: "unsubmitted", submitted_at: null } }, "1925240", now);
  assert.equal(item?.title, "Course Project (Short Video)");
  assert.equal(item?.dueAt, new Date(due).toISOString());
});

test("assignments and assessments occupy distinct spaces, with recent overdue work first", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  const work = model.organizeWork(fixture.assignments, "123", now);
  assert.equal(work[0].title, "Writing response");
  assert.equal(work[0].overdue, true);
  assert.equal(work.find(item => item.title === "Midterm Exam")?.kind, "assessment");
  assert.equal(work.find(item => item.title === "Short quiz")?.kind, "assessment");
  assert.equal(work.find(item => item.title === "Problem Set 4")?.kind, "assignment");
  assert.equal(work.some(item => item.title === "Old task"), false);
  assert.equal(work.some(item => item.title === "Already submitted"), false);
});

test("Canvas missing state is normalized for course health", () => {
  const item = model.workFor({ id: 91, name: "Response", published: true, due_at: "2026-10-09T12:00:00Z",
    submission: { workflow_state: "unsubmitted", missing: true } }, "123", Date.parse("2026-10-07T12:00:00Z"));
  assert.equal(item.missing, true);
  assert.equal(item.late, false);
});

test("announcements are course-scoped updates and cannot inject links or future posts", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  const updates = model.organizeAnnouncements(fixture.announcements, "123", now);
  assert.deepEqual(updates.map(item => item.title), ["Lecture room update", "Read chapter 4"]);
  assert.equal(updates[1].url, "https://canvas.upenn.edu/courses/123/discussion_topics/82");
  assert.equal(model.announcementFor({ id: 12, context_code: "course_123", title: "Update", posted_at: "2026-10-01T12:00:00Z", published: false }, "123", now), null);
});
