"use client";

import { useEffect, useMemo, useState } from "react";
import { addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, startOfMonth, startOfWeek } from "date-fns";
import { ArrowUpRight, ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Workspace } from "@/lib/client-types";
import { courseFor, dateTime } from "@/lib/client-types";
import { priorityScore } from "@/lib/grades";

export default function CalendarView({ data, onEvent, onNewEvent, onPlan }: { data: Workspace; onEvent: (id: string) => void; onNewEvent: () => void; onPlan: () => void }) {
  const [anchor, setAnchor] = useState(new Date());
  const [view, setView] = useState<"week" | "month" | "agenda">("week");
  const [filter, setFilter] = useState("all");
  useEffect(() => { if (window.innerWidth < 800) setView("agenda"); }, []);
  const visible = data.events.filter(e => filter === "all" || e.course_id === filter);
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const days = useMemo(() => view === "week"
    ? eachDayOfInterval({ start: weekStart, end: endOfWeek(anchor, { weekStartsOn: 1 }) })
    : eachDayOfInterval({ start: startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }) }), [anchor, view]);
  const upcoming = visible.filter(e => e.status !== "done" && Date.parse(e.due_at) >= Date.now() - 86_400_000)
    .sort((a, b) => priorityScore(b, courseFor(data, b.course_id)) - priorityScore(a, courseFor(data, a.course_id))).slice(0, 5);
  const advance = (direction: number) => setAnchor(view === "month" ? addMonths(anchor, direction) : addWeeks(anchor, direction));
  const title = view === "agenda" ? "Upcoming dates" : view === "month" ? format(anchor, "MMMM yyyy") : `${format(days[0], "MMMM d")} – ${format(days[days.length - 1], "MMMM d, yyyy")}`;
  return <div className="calendar-layout">
    <section className="calendar-panel" aria-label="Course calendar">
      <div className="section-head"><div><p className="eyebrow">CALENDAR</p><h2>{title}</h2></div><div className="calendar-tools"><NativeSelect aria-label="Filter course" value={filter} onChange={event => setFilter(event.target.value)}><NativeSelectOption value="all">All courses</NativeSelectOption>{data.courses.map(c => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}</NativeSelect><div className="view-toggle"><button aria-pressed={view === "week"} className={view === "week" ? "selected" : ""} onClick={() => setView("week")}>Week</button><button aria-pressed={view === "month"} className={view === "month" ? "selected" : ""} onClick={() => setView("month")}>Month</button><button aria-pressed={view === "agenda"} className={view === "agenda" ? "selected" : ""} onClick={() => setView("agenda")}>Agenda</button></div>{view !== "agenda" && <div className="week-controls"><button onClick={() => advance(-1)} aria-label="Previous"><ChevronLeft size={18} /></button><button onClick={() => setAnchor(new Date())}>Today</button><button onClick={() => advance(1)} aria-label="Next"><ChevronRight size={18} /></button></div>}</div></div>
      {view === "agenda" ? <div className="agenda-list">{visible.filter(e => Date.parse(e.due_at) >= Date.now() - 86_400_000).slice(0, 100).map(e => <button key={e.id} className="agenda-row" onClick={() => onEvent(e.id)}><span className="agenda-date">{format(new Date(e.due_at), "MMM d")}</span><span className={`course-dot ${courseFor(data, e.course_id)?.color || "blue"}`} /><span><strong>{e.title}</strong><small>{courseFor(data, e.course_id)?.name || (e.source==="ics"?"Canvas calendar item":"Personal")} · {dateTime(e.due_at)}</small></span><ArrowUpRight size={16} /></button>)}{!visible.length && <div className="empty-inline">No dates yet. Add your first one to start planning.</div>}</div>
      : <div className={`calendar-grid ${view === "month" ? "month-grid" : "week-grid"}`}>{days.map(date => <div className="day-column" key={date.toISOString()}><div className="day-label"><time dateTime={format(date, "yyyy-MM-dd")} aria-label={format(date, "EEEE, MMMM d, yyyy")}><span>{format(date, "EEE")}</span><strong className={isSameDay(date, new Date()) ? "today-date" : ""}>{format(date, "d")}</strong></time></div><div className="day-body">{visible.filter(e => isSameDay(new Date(e.due_at), date)).map(e => <button className={`calendar-item ${courseFor(data, e.course_id)?.color || "blue"} ${e.status === "done" ? "completed" : ""}`} key={e.id} onClick={() => onEvent(e.id)}><small>{format(new Date(e.due_at), "h:mm a")}</small><strong>{e.title}</strong><span>{courseFor(data, e.course_id)?.name || (e.source==="ics"?"Canvas calendar item":"Personal")}</span></button>)}</div></div>)}</div>}
      <div className="calendar-footer"><Button variant="outline" size="sm" onClick={onNewEvent}><Plus size={16} /> Add a date</Button><span>Open any item for instructions, points, and its Canvas link.</span></div>
    </section>
    <aside className="right-rail"><div className="rail-heading"><p className="eyebrow">FOCUS NEXT</p><h2>What needs attention</h2></div><div className="upcoming-list">{upcoming.length ? upcoming.map(e => <button className="upcoming-row" key={e.id} onClick={() => onEvent(e.id)}><span className={`course-dot ${courseFor(data, e.course_id)?.color || "blue"}`} /><span className="upcoming-text"><strong>{e.title}</strong><small>{courseFor(data, e.course_id)?.name || (e.source==="ics"?"Canvas calendar item":"Personal")} · {dateTime(e.due_at)}</small></span><ArrowUpRight size={17} /></button>) : <p className="rail-empty">No upcoming work on your calendar.</p>}</div><div className="insight-panel"><Sparkles size={18} /><p className="eyebrow">WEEKLY PLAN</p><h3>Give every deadline a time slot.</h3><p>Turn upcoming assignments into study blocks around your available days.</p><button onClick={onPlan}>Build this week’s plan <ArrowUpRight size={16} /></button></div></aside>
  </div>;
}
