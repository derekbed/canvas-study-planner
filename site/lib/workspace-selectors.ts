import type { Course, Event } from "@/lib/client-types";
import { priorityScore } from "@/lib/grades";

export function rankEvents(
  events: Event[],
  courses: Map<string, Course>,
  time: number,
) {
  return events
    .map((event) => ({
      event,
      score: priorityScore(event, courses.get(event.course_id || ""), time),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ event }) => event);
}

export function eventCourseName(event: Event, courses: Map<string, Course>) {
  return (
    courses.get(event.course_id || "")?.name ||
    (event.source === "ics" ? "Canvas calendar item" : "Personal")
  );
}

export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function eventsByDay(events: Event[]) {
  const days = new Map<string, Event[]>();
  for (const event of events) {
    const key = localDateKey(new Date(event.due_at));
    const group = days.get(key);
    if (group) group.push(event);
    else days.set(key, [event]);
  }
  return days;
}
