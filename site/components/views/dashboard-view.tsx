"use client";
import { useMemo, useState } from "react";
import type { Workspace } from "@/lib/client-types";
import { dateTime } from "@/lib/client-types";
import { priorityReason } from "@/lib/grades";
import { eventCourseName, rankEvents } from "@/lib/workspace-selectors";

export default function DashboardView({
  data,
  onEvent,
  now,
}: {
  data: Workspace;
  now: number;
  onEvent: (id: string) => void;
}) {
  const [progress, setProgress] = useState(false);
  const week = now + 7 * 86_400_000;
  const courses = useMemo(
    () => new Map(data.courses.map((course) => [course.id, course])),
    [data.courses],
  );
  const { pending, completed } = useMemo(
    () => ({
      pending: data.events.filter((e) => e.status !== "done"),
      completed: data.events.filter((e) => e.status === "done"),
    }),
    [data.events],
  );
  const upcoming = pending.filter(
    (e) => Date.parse(e.due_at) >= now && Date.parse(e.due_at) <= week,
  );
  const blocks = data.blocks.filter(
    (b) =>
      Date.parse(b.starts_at) >= now &&
      Date.parse(b.starts_at) <= week &&
      b.status === "planned",
  );
  const focus = data.focusSessions
    .filter((s) => Date.parse(s.completed_at) >= now - 7 * 86400000)
    .reduce((n, s) => n + s.minutes, 0);
  const priority = useMemo(
    () => rankEvents(pending, courses, now).slice(0, 10),
    [pending, courses, now],
  );
  return (
    <div className="dashboard">
      <section className="content-panel">
        <p className="eyebrow">WEEKLY SUMMARY</p>
        <h2>Your next seven days</h2>
        <div className="grade-metrics">
          <div>
            <span>Upcoming deadlines</span>
            <strong>{upcoming.length}</strong>
            <small>
              {pending.filter((e) => Date.parse(e.due_at) < now).length} overdue
            </small>
          </div>
          <div>
            <span>Planned study</span>
            <strong>
              {(blocks.reduce((n, b) => n + b.minutes, 0) / 60).toFixed(1)}h
            </strong>
            <small>{blocks.length} sessions</small>
          </div>
          <div>
            <span>Focus this past week</span>
            <strong>{focus}m</strong>
            <small>{completed.length} completed items overall</small>
          </div>
        </div>
      </section>
      <section className="content-panel">
        <div className="panel-title">
          <h2>What to work on next</h2>
          <span>Due date · effort · points · grade goal</span>
        </div>
        <p>
          Recommendations use your listed work and study estimates. Missing
          grades and unlisted work can change their order.
        </p>
        {priority.length ? (
          priority.map((e) => (
            <button
              className="priority-card"
              key={e.id}
              onClick={() => onEvent(e.id)}
            >
              <span
                className={`course-dot ${courses.get(e.course_id || "")?.color || "blue"}`}
              />
              <span>
                <strong>{e.title}</strong>
                <small>{eventCourseName(e, courses)}</small>
                <p>
                  {priorityReason(
                    e,
                    courses.get(e.course_id || ""),
                    data.events,
                    now,
                  )}
                </p>
              </span>
            </button>
          ))
        ) : (
          <p>No unfinished work. Add dates to begin planning.</p>
        )}
      </section>
      <section className="content-panel">
        <button
          className="inline-link"
          onClick={() => setProgress(!progress)}
          aria-expanded={progress}
        >
          {progress ? "Hide" : "Show"} progress and grade trends
        </button>
        {progress && (
          <>
            <h3>Completed work</h3>
            {completed.length ? (
              completed
                .slice(-12)
                .reverse()
                .map((e) => (
                  <button
                    key={e.id}
                    className="assignment-row"
                    onClick={() => onEvent(e.id)}
                  >
                    <strong>{e.title}</strong>
                    <span>{dateTime(e.due_at)}</span>
                  </button>
                ))
            ) : (
              <p>Complete an item to see it here.</p>
            )}
            <h3>Grade history</h3>
            <p>
              Recorded when you save a current grade or sync Canvas. Grades are
              snapshots, not predictions.
            </p>
            {data.courses.map((c) => {
              const history = data.gradeHistory.filter(
                (g) => g.course_id === c.id,
              );
              return (
                <div className="trend" key={c.id}>
                  <strong>{c.name}</strong>
                  {history.length ? (
                    <ol>
                      {history.slice(-8).map((g, i) => (
                        <li key={i}>
                          {new Date(g.recorded_at).toLocaleDateString()}:{" "}
                          <strong>{g.grade.toFixed(1)}%</strong>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>No snapshots yet. Save your current grade in Courses.</p>
                  )}
                </div>
              );
            })}
          </>
        )}
      </section>
    </div>
  );
}
