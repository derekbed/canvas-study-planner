"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Bell, CalendarDays, Check, ExternalLink, Link2, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Toaster } from "@/components/ui/sonner";
import type { Event, Workspace } from "@/lib/client-types";
import { courseFor, dateTime, plain } from "@/lib/client-types";
import CalendarView from "@/components/views/calendar-view";
import CoursesView from "@/components/views/courses-view";
import GradesView from "@/components/views/grades-view";
import PlanView from "@/components/views/plan-view";
import ChatView from "@/components/views/chat-view";

const tabs = ["calendar", "courses", "plan", "grades", "chat"] as const;
type Tab = typeof tabs[number];

export default function CoursewiseApp() {
  const [data, setData] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("calendar");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [courseDialog, setCourseDialog] = useState(false);
  const [eventDialog, setEventDialog] = useState(false);
  const [connectDialog, setConnectDialog] = useState(false);
  const [reminderDialog, setReminderDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const notified = useRef(new Set<string>());

  const reload = useCallback(async () => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    const result = await response.json() as Workspace & { error?: string };
    if (!response.ok) throw new Error(result.error || "Workspace could not load.");
    setData(result);
  }, []);
  useEffect(() => { reload().catch(error => toast.error(error.message)).finally(() => setLoading(false)); }, [reload]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("canvas") === "connected") toast.success("Canvas connected and courses synced.");
    if (params.get("canvas") === "error") toast.error("Canvas could not connect. Please try again.");
    if (params.has("canvas")) window.history.replaceState({}, "", "/");
  }, []);

  const mutate = useCallback(async (action: string, payload: Record<string, unknown>) => {
    const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
    const result = await response.json() as Workspace & { error?: string };
    if (!response.ok) throw new Error(result.error || "Could not save changes.");
    setData(result as Workspace);
  }, []);
  const run = async (task: () => Promise<void>, success?: string) => {
    setBusy(true);
    try { await task(); if (success) toast.success(success); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Something went wrong."); }
    finally { setBusy(false); }
  };
  const sync = () => run(async () => {
    const response = await fetch("/api/canvas/sync", { method: "POST" });
    const result = await response.json() as Workspace & { error?: string };
    if (!response.ok) throw new Error(result.error || "Canvas could not sync.");
    setData(result);
  }, "Canvas is up to date.");
  const importCalendar = async (payload: { feedUrl?: string; icsText?: string }) => {
    const response = await fetch("/api/calendar/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json() as Workspace & { error?: string; imported?: number };
    if (!response.ok) throw new Error(result.error || "Calendar feed could not import.");
    setData(result);
    setFeedUrl("");
    setConnectDialog(false);
    setActiveTab("calendar");
    toast.success(`Imported ${result.imported || 0} Canvas calendar items.`);
  };
  const importFeed = () => run(() => importCalendar({ feedUrl }));
  const importCalendarFile = (file: File | undefined) => {
    if (!file) return;
    void run(async () => {
      if (!file.name.toLowerCase().endsWith(".ics")) throw new Error("Choose a Canvas .ics calendar file.");
      if (file.size > 5_000_000) throw new Error("Calendar files must be under 5 MB.");
      await importCalendar({ icsText: await file.text() });
    });
  };
  const selectedEvent: Event | undefined = data?.events.find(e => e.id === selectedEventId);
  const reminders = useMemo(() => {
    if (!data) return [];
    const windowMs = (data.settings?.reminder_hours || 24) * 3_600_000;
    return data.events.filter(e => e.status !== "done" && Date.parse(e.due_at) >= Date.now() && Date.parse(e.due_at) <= Date.now() + windowMs).slice(0, 12);
  }, [data]);
  useEffect(() => {
    if (!data || !("Notification" in window)) return;
    const check = () => {
      if (Notification.permission !== "granted") return;
      const hours = data.settings?.reminder_hours || 24;
      for (const event of data.events) {
        const until = Date.parse(event.due_at) - Date.now();
        if (event.status === "done" || until < 0 || until > hours * 3_600_000 || notified.current.has(event.id)) continue;
        new Notification(`Upcoming: ${event.title}`, { body: `Due ${dateTime(event.due_at)}` });
        notified.current.add(event.id);
      }
    };
    const timer = window.setInterval(check, 60_000); check();
    return () => window.clearInterval(timer);
  }, [data]);
  const demo = data?.courses.some(c => c.source === "demo") && !data.connection;

  return <main className="app-shell">
    <Toaster position="top-right" richColors />
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><CalendarDays size={20} /></span>Course<span className="brand-light">wise</span></div>
      <div className="topbar-actions">
        {demo && <span className="demo-pill">Sample workspace</span>}
        {data?.connection && <span className="sync-label">Canvas synced {data.connection.last_sync_at ? new Date(data.connection.last_sync_at).toLocaleDateString() : "recently"}</span>}
        <button aria-label={`Reminders, ${reminders.length} upcoming`} className="icon-button reminder-button" onClick={() => setReminderDialog(true)}><Bell size={20} />{reminders.length > 0 && <span className="reminder-count">{reminders.length}</span>}</button>
        <span className="avatar" aria-label="Student workspace">S</span>
      </div>
    </header>
    <div className="workspace">
      <div className="page-heading">
        <div><p className="eyebrow">YOUR WORKSPACE</p><h1>{activeTab === "calendar" ? "Stay ahead of your week." : activeTab === "courses" ? "Your courses." : activeTab === "plan" ? "Make a plan that fits." : activeTab === "grades" ? "Know where you stand." : "Study with your coursework."}</h1><p className="heading-copy">{activeTab === "calendar" ? "Your dates, assignments, and study time in one place." : activeTab === "courses" ? "Keep assignments and course materials together." : activeTab === "plan" ? "Turn deadlines into focused study blocks." : activeTab === "grades" ? "Explore targets and see which work matters most." : "Ask questions, build flashcards, and practice."}</p></div>
        <div className="heading-actions">{data?.connection && <Button variant="outline" onClick={sync} disabled={busy}><RefreshCw size={16} /> Sync</Button>}<Button className="connect-button" onClick={() => data?.canvasAvailable ? window.location.assign("/api/canvas/start") : setConnectDialog(true)}><Link2 size={17} /> {data?.connection ? "Reconnect Canvas" : "Connect Canvas"}</Button></div>
      </div>
      <Tabs value={activeTab} onValueChange={value => setActiveTab(value as Tab)} className="main-tabs">
        <TabsList variant="line" className="main-tabs-list">{tabs.map(tab => <TabsTrigger value={tab} key={tab}>{tab === "plan" ? "Study plan" : tab === "chat" ? "AI study chat" : tab[0].toUpperCase() + tab.slice(1)}</TabsTrigger>)}</TabsList>
        {loading && <div className="loading-state"><Loader2 className="animate-spin" size={25} /> Loading your workspace…</div>}
        {!loading && !data && <div className="error-state"><h2>Workspace unavailable</h2><p>Please reload this page to try again.</p><Button onClick={() => { setLoading(true); reload().finally(() => setLoading(false)); }}>Retry</Button></div>}
        {data && <>
          <TabsContent value="calendar"><CalendarView data={data} onEvent={setSelectedEventId} onNewEvent={() => setEventDialog(true)} onPlan={() => setActiveTab("plan")} /></TabsContent>
          <TabsContent value="courses"><CoursesView data={data} onEvent={setSelectedEventId} onNewCourse={() => setCourseDialog(true)} onNewEvent={() => setEventDialog(true)} onRefresh={reload} onMutate={mutate} /></TabsContent>
          <TabsContent value="plan"><PlanView data={data} onEvent={setSelectedEventId} onMutate={mutate} /></TabsContent>
          <TabsContent value="grades"><GradesView data={data} onEvent={setSelectedEventId} onMutate={mutate} /></TabsContent>
          <TabsContent value="chat"><ChatView data={data} /></TabsContent>
        </>}
      </Tabs>
    </div>

    <Sheet open={Boolean(selectedEvent)} onOpenChange={open => !open && setSelectedEventId(null)}>
      <SheetContent className="event-sheet">
        {selectedEvent && data && <><SheetHeader><div className={`course-kicker ${courseFor(data, selectedEvent.course_id)?.color || "blue"}`}>{courseFor(data, selectedEvent.course_id)?.name || "Personal calendar"}</div><SheetTitle>{selectedEvent.title}</SheetTitle><SheetDescription>{dateTime(selectedEvent.due_at)} · {selectedEvent.kind}</SheetDescription></SheetHeader>
          <div className="sheet-body"><div className="detail-meta"><span>Due</span><strong>{dateTime(selectedEvent.due_at)}</strong></div>{selectedEvent.points_possible != null && <div className="detail-meta"><span>Points</span><strong>{selectedEvent.points_earned != null ? `${selectedEvent.points_earned} / ` : ""}{selectedEvent.points_possible}</strong></div>}<div className="detail-meta"><span>Study estimate</span><strong>{selectedEvent.estimated_minutes} min</strong></div>{selectedEvent.grade_group && <div className="detail-meta"><span>Grade group</span><strong>{selectedEvent.grade_group}</strong></div>}
            <h3>Details</h3><p>{plain(selectedEvent.description) || "No additional instructions were provided."}</p>
            {selectedEvent.url && <a href={selectedEvent.url} target="_blank" rel="noreferrer" className="inline-link">Open in Canvas <ExternalLink size={15} /></a>}
            <Button className="sheet-action" variant={selectedEvent.status === "done" ? "outline" : "default"} onClick={() => run(() => mutate("event:update", { id: selectedEvent.id, status: selectedEvent.status === "done" ? "upcoming" : "done", pointsEarned: selectedEvent.points_earned }), "Assignment updated.")}>{selectedEvent.status === "done" ? "Mark as still to do" : <><Check size={16} /> Mark complete</>}</Button>
          </div></>}
      </SheetContent>
    </Sheet>

    <Dialog open={courseDialog} onOpenChange={setCourseDialog}><DialogContent><DialogHeader><DialogTitle>Add a course</DialogTitle><DialogDescription>Keep courses here even when they are not in Canvas.</DialogDescription></DialogHeader><form className="form-stack" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); run(() => mutate("course:create", { name: form.get("name"), code: form.get("code"), color: form.get("color") }), "Course added."); setCourseDialog(false); }}><label>Course name<input name="name" required placeholder="e.g. Chemistry" /></label><label>Course code<input name="code" placeholder="e.g. CHEM 101" /></label><label>Color<NativeSelect name="color" defaultValue="blue"><NativeSelectOption value="blue">Blue</NativeSelectOption><NativeSelectOption value="violet">Purple</NativeSelectOption><NativeSelectOption value="orange">Orange</NativeSelectOption><NativeSelectOption value="teal">Teal</NativeSelectOption><NativeSelectOption value="rose">Rose</NativeSelectOption></NativeSelect></label><Button type="submit"><Plus size={16} /> Add course</Button></form></DialogContent></Dialog>
    <Dialog open={eventDialog} onOpenChange={setEventDialog}><DialogContent><DialogHeader><DialogTitle>Add a date</DialogTitle><DialogDescription>Add an assignment, test, or personal course reminder.</DialogDescription></DialogHeader><form className="form-stack" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); run(() => mutate("event:create", { title: form.get("title"), courseId: form.get("courseId"), dueAt: form.get("dueAt"), kind: form.get("kind"), pointsPossible: form.get("pointsPossible"), estimatedMinutes: form.get("estimatedMinutes"), description: form.get("description") }), "Date added."); setEventDialog(false); }}><label>Title<input name="title" required placeholder="e.g. Lab report" /></label><label>Course<NativeSelect name="courseId"><NativeSelectOption value="">Personal</NativeSelectOption>{data?.courses.map(c => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}</NativeSelect></label><div className="form-row"><label>Due date and time<input type="datetime-local" name="dueAt" required /></label><label>Type<NativeSelect name="kind"><NativeSelectOption value="assignment">Assignment</NativeSelectOption><NativeSelectOption value="quiz">Quiz</NativeSelectOption><NativeSelectOption value="exam">Exam</NativeSelectOption><NativeSelectOption value="event">Event</NativeSelectOption></NativeSelect></label></div><div className="form-row"><label>Points possible<input type="number" name="pointsPossible" min="0" /></label><label>Estimated minutes<input type="number" name="estimatedMinutes" min="15" max="600" defaultValue={60} /></label></div><label>Details<textarea name="description" rows={3} placeholder="Instructions or topics to cover" /></label><Button type="submit"><Plus size={16} /> Add date</Button></form></DialogContent></Dialog>
    <Dialog open={connectDialog} onOpenChange={setConnectDialog}><DialogContent><DialogHeader><DialogTitle>Connect your Canvas calendar</DialogTitle><DialogDescription>Your school blocks personal access tokens, so start with the Canvas calendar feed. It brings real due dates into Coursewise while full Canvas sign-in waits on school approval.</DialogDescription></DialogHeader><form className="form-stack" onSubmit={event => { event.preventDefault(); importFeed(); }}><label>Canvas calendar feed<input value={feedUrl} onChange={event => setFeedUrl(event.target.value)} placeholder="https://canvas.school.edu/feeds/calendars/..." /></label><Button type="submit" disabled={busy || !feedUrl.trim()}><RefreshCw size={16} /> Import calendar</Button></form><div className="form-stack"><label>Or upload the .ics file<input type="file" accept=".ics,text/calendar" disabled={busy} onChange={event => importCalendarFile(event.target.files?.[0])} /></label><p className="dialog-note">If Canvas blocks the link here, open it in your browser, download the calendar file, and upload it above.</p></div><Button variant="outline" onClick={() => { setConnectDialog(false); setCourseDialog(true); }}>Add a course manually</Button></DialogContent></Dialog>
    <Dialog open={reminderDialog} onOpenChange={setReminderDialog}><DialogContent><DialogHeader><DialogTitle>Reminders</DialogTitle><DialogDescription>Work due within the next {data?.settings?.reminder_hours || 24} hours.</DialogDescription></DialogHeader><div className="reminder-list">{reminders.length ? reminders.map(e => <button key={e.id} onClick={() => { setReminderDialog(false); setSelectedEventId(e.id); }}><span>{e.title}</span><small>{dateTime(e.due_at)}</small></button>) : <p>You are clear for now.</p>}</div><p className="dialog-note">Reminders appear in this workspace while you are using the site.</p></DialogContent></Dialog>
  </main>;
}
