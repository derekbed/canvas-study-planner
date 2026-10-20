"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  ExternalLink,
  Link2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Toaster } from "@/components/ui/sonner";
import type { Event, Workspace } from "@/lib/client-types";
import { courseFor, dateTime, plain } from "@/lib/client-types";
import { useWorkspace } from "@/hooks/use-workspace";
import { jsonBody, requestJson } from "@/lib/request";
import {
  ViewBoundary,
  WorkspaceError,
  WorkspaceLoading,
} from "@/components/workspace-status";

import DashboardView from "@/components/views/dashboard-view";

import FocusTimer from "@/components/focus-timer";

const CalendarView = lazy(() => import("@/components/views/calendar-view"));
const CoursesView = lazy(() => import("@/components/views/courses-view"));
const GradesView = lazy(() => import("@/components/views/grades-view"));
const PlanView = lazy(() => import("@/components/views/plan-view"));
const ReviewView = lazy(() => import("@/components/views/review-view"));
const PrivacyView = lazy(() => import("@/components/views/privacy-view"));

const tabs = [
  "dashboard",
  "calendar",
  "courses",
  "plan",
  "grades",
  "review",
  "privacy",
] as const;
type Tab = (typeof tabs)[number];
type Page = { tab: Tab; courseId: string };
const headings: Record<Tab, [string, string]> = {
  dashboard: [
    "Your next step, made clear.",
    "Priorities and progress from your coursework.",
  ],
  review: [
    "Keep what you learn.",
    "Review saved cards when they need another look.",
  ],
  privacy: ["Your data, your choice.", "Manage exports and deletion."],
  calendar: [
    "Stay ahead of your week.",
    "Your dates, assignments, and study time in one place.",
  ],
  courses: ["Your courses.", "Keep assignments and course materials together."],
  plan: ["Make a plan that fits.", "Turn deadlines into focused study blocks."],
  grades: [
    "Know where you stand.",
    "Explore targets and see which work matters most.",
  ],
};

export default function CoursewiseApp() {
  const {
    data,
    eligible,
    loading,
    error,
    update,
    reload,
    initialize,
    confirmAge: acceptAge,
    mutate,
  } = useWorkspace();
  const [confirmingAge, setConfirmingAge] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [pageHistory, setPageHistory] = useState<Page[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [courseDialog, setCourseDialog] = useState(false);
  const [eventDialog, setEventDialog] = useState(false);
  const [connectDialog, setConnectDialog] = useState(false);
  const [reminderDialog, setReminderDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const notified = useRef(new Set<string>());
  const navigateTo = (tab: Tab, courseId = selectedCourseId) => {
    if (tab === activeTab && courseId === selectedCourseId) return;
    setPageHistory((history) => [
      ...history.slice(-19),
      { tab: activeTab, courseId: selectedCourseId },
    ]);
    setActiveTab(tab);
    setSelectedCourseId(courseId);
  };
  const goBack = () => {
    const previous = pageHistory.at(-1);
    if (!previous) return;
    setPageHistory(pageHistory.slice(0, -1));
    setActiveTab(previous.tab);
    setSelectedCourseId(previous.courseId);
  };

  const confirmAge = async () => {
    setConfirmingAge(true);
    try {
      await acceptAge();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Try again.");
    } finally {
      setConfirmingAge(false);
    }
  };
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("canvas") === "connected")
      toast.success("Canvas connected and courses synced.");
    if (params.get("canvas") === "error")
      toast.error("Canvas could not connect. Please try again.");
    if (params.has("canvas")) window.history.replaceState({}, "", "/");
  }, []);

  const run = async (task: () => Promise<void>, success?: string) => {
    setBusy(true);
    try {
      await task();
      if (success) toast.success(success);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  };
  const sync = () =>
    run(async () => {
      update(
        await requestJson<Workspace>(
          "/api/canvas/sync",
          "Canvas could not sync.",
          { method: "POST" },
        ),
      );
    }, "Canvas is up to date.");
  const importCalendar = async (payload: {
    feedUrl?: string;
    icsText?: string;
  }) => {
    const result = await requestJson<
      Workspace & {
        summary?: {
          added: number;
          updated: number;
          removed: number;
          unchanged: number;
        };
      }
    >(
      "/api/calendar/import",
      "Calendar feed could not import.",
      jsonBody({
        ...payload,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    );
    update(result);
    setFeedUrl("");
    setConnectDialog(false);
    navigateTo("calendar");
    toast.success(
      `${result.summary?.added || 0} added, ${result.summary?.updated || 0} updated, ${result.summary?.removed || 0} removed, ${result.summary?.unchanged || 0} unchanged.`,
    );
  };
  const importFeed = () => run(() => importCalendar({ feedUrl }));
  const importCalendarFile = (file: File | undefined) => {
    if (!file) return;
    void run(async () => {
      if (!file.name.toLowerCase().endsWith(".ics"))
        throw new Error("Choose a Canvas .ics calendar file.");
      if (file.size > 5_000_000)
        throw new Error("Calendar files must be under 5 MB.");
      await importCalendar({ icsText: await file.text() });
    });
  };
  const selectedEvent: Event | undefined = data?.events.find(
    (e) => e.id === selectedEventId,
  );
  const reminders = useMemo(() => {
    if (!data) return [];
    const windowMs = (data.settings?.reminder_hours || 24) * 3_600_000;
    return data.events
      .filter(
        (e) =>
          e.status !== "done" &&
          Date.parse(e.due_at) >= clock &&
          Date.parse(e.due_at) <= clock + windowMs,
      )
      .slice(0, 12);
  }, [data, clock]);
  useEffect(() => {
    if (!data || !data.preferences.browserAlerts || !("Notification" in window))
      return;
    const check = () => {
      if (Notification.permission !== "granted") return;
      const hours = data.settings?.reminder_hours || 24;
      for (const event of data.events) {
        const until = Date.parse(event.due_at) - Date.now();
        if (
          event.status === "done" ||
          until < 0 ||
          until > hours * 3_600_000 ||
          notified.current.has(`${event.id}:${event.due_at}:${hours}`)
        )
          continue;
        new Notification(`Upcoming: ${event.title}`, {
          body: `Due ${dateTime(event.due_at)}`,
        });
        notified.current.add(`${event.id}:${event.due_at}:${hours}`);
      }
    };
    check();
  }, [data, clock]);
  const demo =
    data?.courses.some((c) => c.source === "demo") && !data.connection;

  if (eligible === false)
    return (
      <main className="legal-page eligibility-page">
        <Toaster position="top-right" richColors />
        <h1>Welcome to Coursewise</h1>
        {error && <p role="alert">{error}</p>}
        <p>
          Coursewise is for high school and college students age 13 or older.
          Please confirm your eligibility before your workspace or Canvas data
          is loaded. We do not ask for your birth date.
        </p>
        <button type="button" onClick={confirmAge} disabled={confirmingAge}>
          {confirmingAge ? "Saving…" : "I am at least 13 years old"}
        </button>
        <p>If you are under 13, do not continue or use the extension.</p>
        <p>
          <a href="/privacy-policy">Privacy notice</a> ·{" "}
          <a href="/accessibility">Accessibility</a>
        </p>
      </main>
    );

  return (
    <main className="app-shell">
      <Toaster position="top-right" richColors />
      <header className="topbar">
        <div className="topbar-leading">
          <Button
            className="page-back-button"
            variant="outline"
            onClick={goBack}
            disabled={!pageHistory.length}
            title={
              pageHistory.length
                ? "Go to previous Coursewise page"
                : "No previous Coursewise page"
            }
          >
            <ArrowLeft size={16} /> Back
          </Button>
          <div className="brand">
            <span className="brand-mark">
              <CalendarDays size={20} />
            </span>
            Course<span className="brand-light">wise</span>
          </div>
        </div>
        <div className="topbar-actions">
          {demo && <span className="demo-pill">Sample workspace</span>}
          {data?.connection && (
            <span className="sync-label">
              Canvas synced{" "}
              {data.connection.last_sync_at
                ? new Date(data.connection.last_sync_at).toLocaleDateString()
                : "recently"}
            </span>
          )}
          <button
            aria-label={`Reminders, ${reminders.length} upcoming`}
            className="icon-button reminder-button"
            onClick={() => setReminderDialog(true)}
          >
            <Bell size={20} />
            {reminders.length > 0 && (
              <span className="reminder-count">{reminders.length}</span>
            )}
          </button>
          <span className="avatar" aria-label="Student workspace">
            S
          </span>
        </div>
      </header>
      <div className="workspace">
        <div className="page-heading">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h1>{headings[activeTab][0]}</h1>
            <p className="heading-copy">{headings[activeTab][1]}</p>
          </div>
          <div className="heading-actions">
            {data?.connection && (
              <Button variant="outline" onClick={sync} disabled={busy}>
                <RefreshCw size={16} /> Sync
              </Button>
            )}
            {data?.canvasAvailable ? (
              <Button asChild className="connect-button">
                <a href="/api/canvas/start">
                  <Link2 size={17} />{" "}
                  {data.connection ? "Reconnect Canvas" : "Connect Canvas"}
                </a>
              </Button>
            ) : (
              <Button
                className="connect-button"
                onClick={() => setConnectDialog(true)}
              >
                <Link2 size={17} /> Connect Canvas
              </Button>
            )}
          </div>
        </div>
        <Tabs
          value={activeTab}
          onValueChange={(value) => navigateTo(value as Tab)}
          className="main-tabs"
        >
          <TabsList variant="line" className="main-tabs-list">
            {tabs.map((tab) => (
              <TabsTrigger value={tab} key={tab}>
                {tab === "privacy"
                  ? "Data & privacy"
                  : tab === "dashboard"
                    ? "Today"
                    : tab === "plan"
                      ? "Study plan"
                      : tab[0].toUpperCase() + tab.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>
          {loading && <WorkspaceLoading />}
          {!loading && !data && (
            <WorkspaceError
              message={error || "Please try loading your workspace again."}
              onRetry={() => void initialize()}
            />
          )}
          <ViewBoundary key={activeTab}>
            <Suspense fallback={<WorkspaceLoading />}>
              {data && (
                <>
                  <TabsContent value="dashboard">
                    <DashboardView
                      now={clock}
                      data={data}
                      onEvent={setSelectedEventId}
                    />
                  </TabsContent>
                  <TabsContent value="review">
                    <ReviewView data={data} onMutate={mutate} />
                  </TabsContent>
                  <TabsContent value="privacy">
                    <PrivacyView data={data} onMutate={mutate} />
                  </TabsContent>
                  <TabsContent value="calendar">
                    <div className="calendar-import-meta">
                      <span>
                        {data.calendarImport
                          ? `Canvas calendar · last imported ${dateTime(data.calendarImport.last_import_at)}`
                          : "No Canvas calendar imported yet."}
                      </span>
                      <Button
                        variant="outline"
                        onClick={() => setConnectDialog(true)}
                      >
                        Import calendar
                      </Button>
                      <a href="/api/export?format=ics">Export .ics</a>
                    </div>
                    <CalendarView
                      now={clock}
                      data={data}
                      onEvent={setSelectedEventId}
                      onNewEvent={() => setEventDialog(true)}
                      onPlan={() => navigateTo("plan")}
                    />
                  </TabsContent>
                  <TabsContent value="courses">
                    <CoursesView
                      data={data}
                      selectedCourseId={selectedCourseId}
                      onSelectCourse={(id) => navigateTo("courses", id)}
                      onEvent={setSelectedEventId}
                      onNewCourse={() => setCourseDialog(true)}
                      onNewEvent={() => setEventDialog(true)}
                      onRefresh={() => reload()}
                      onMutate={mutate}
                    />
                  </TabsContent>
                  <TabsContent value="plan">
                    <PlanView
                      data={data}
                      onEvent={setSelectedEventId}
                      onMutate={mutate}
                    />
                  </TabsContent>
                  <TabsContent value="grades">
                    <GradesView
                      data={data}
                      onEvent={setSelectedEventId}
                      onMutate={mutate}
                    />
                  </TabsContent>
                </>
              )}
            </Suspense>
          </ViewBoundary>
        </Tabs>
        {data && (
          <details className="focus-drawer">
            <summary>Focus timer</summary>
            <FocusTimer data={data} onMutate={mutate} />
          </details>
        )}
        <footer className="site-footer">
          <a href="/privacy-policy">Privacy notice</a>
          <a href="/accessibility">Accessibility</a>
        </footer>
      </div>

      <Sheet
        open={Boolean(selectedEvent)}
        onOpenChange={(open) => !open && setSelectedEventId(null)}
      >
        <SheetContent className="event-sheet">
          {selectedEvent && data && (
            <>
              <SheetHeader>
                <div
                  className={`course-kicker ${courseFor(data, selectedEvent.course_id)?.color || "blue"}`}
                >
                  {courseFor(data, selectedEvent.course_id)?.name ||
                    (selectedEvent.source === "ics"
                      ? "Canvas calendar item"
                      : "Personal calendar")}
                </div>
                <SheetTitle>{selectedEvent.title}</SheetTitle>
                <SheetDescription>
                  {dateTime(selectedEvent.due_at)} · {selectedEvent.kind}
                </SheetDescription>
              </SheetHeader>
              <div className="sheet-body">
                <div className="detail-meta">
                  <span>Due</span>
                  <strong>{dateTime(selectedEvent.due_at)}</strong>
                </div>
                {selectedEvent.points_possible != null && (
                  <div className="detail-meta">
                    <span>Points</span>
                    <strong>
                      {selectedEvent.points_earned != null
                        ? `${selectedEvent.points_earned} / `
                        : ""}
                      {selectedEvent.points_possible}
                    </strong>
                  </div>
                )}
                <div className="detail-meta">
                  <span>Study estimate</span>
                  <strong>{selectedEvent.estimated_minutes} min</strong>
                </div>
                {selectedEvent.grade_group && (
                  <div className="detail-meta">
                    <span>Grade group</span>
                    <strong>{selectedEvent.grade_group}</strong>
                  </div>
                )}
                <p>
                  Source:{" "}
                  {selectedEvent.source === "ics"
                    ? "Canvas calendar feed"
                    : selectedEvent.source === "canvas"
                      ? "Canvas sync"
                      : selectedEvent.source === "demo"
                        ? "Sample data"
                        : "Student entry"}
                </p>
                <form
                  key={selectedEvent.id}
                  className="form-stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(
                      () =>
                        mutate("event:details", {
                          id: selectedEvent.id,
                          courseId: f.get("courseId"),
                          estimatedMinutes: f.get("minutes"),
                          gradeGroup: f.get("group"),
                          pointsPossible: f.get("possible"),
                          pointsEarned: f.get("earned"),
                        }),
                      "Date details saved.",
                    );
                  }}
                >
                  <label>
                    Assign course
                    <select
                      name="courseId"
                      defaultValue={selectedEvent.course_id || ""}
                    >
                      <option value="">Unassigned</option>
                      {data.courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Estimated effort (minutes)
                    <input
                      type="number"
                      name="minutes"
                      min="15"
                      max="600"
                      defaultValue={selectedEvent.estimated_minutes}
                    />
                  </label>
                  <label>
                    Grading category
                    <input
                      name="group"
                      defaultValue={selectedEvent.grade_group}
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Points possible
                      <input
                        name="possible"
                        type="number"
                        min="0"
                        step="any"
                        defaultValue={selectedEvent.points_possible ?? ""}
                      />
                    </label>
                    <label>
                      Score earned
                      <input
                        name="earned"
                        type="number"
                        min="0"
                        step="any"
                        defaultValue={selectedEvent.points_earned ?? ""}
                      />
                    </label>
                  </div>
                  <Button disabled={busy} variant="outline">
                    Save details
                  </Button>
                </form>
                <h3>Details</h3>
                <p>
                  {plain(selectedEvent.description) ||
                    "No additional instructions were provided."}
                </p>
                {selectedEvent.url && (
                  <a
                    href={selectedEvent.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-link"
                  >
                    Open in Canvas <ExternalLink size={15} />
                  </a>
                )}
                <Button
                  className="sheet-action"
                  disabled={busy}
                  variant={
                    selectedEvent.status === "done" ? "outline" : "default"
                  }
                  onClick={() =>
                    run(
                      () =>
                        mutate("event:update", {
                          id: selectedEvent.id,
                          status:
                            selectedEvent.status === "done"
                              ? "upcoming"
                              : "done",
                          pointsEarned: selectedEvent.points_earned,
                        }),
                      "Assignment updated.",
                    )
                  }
                >
                  {selectedEvent.status === "done" ? (
                    "Mark as still to do"
                  ) : (
                    <>
                      <Check size={16} /> Mark complete
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={courseDialog} onOpenChange={setCourseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a course</DialogTitle>
            <DialogDescription>
              Keep courses here even when they are not in Canvas.
            </DialogDescription>
          </DialogHeader>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              run(async () => {
                await mutate("course:create", {
                  name: form.get("name"),
                  code: form.get("code"),
                  color: form.get("color"),
                });
                setCourseDialog(false);
              }, "Course added.");
            }}
          >
            <label>
              Course name
              <input name="name" required placeholder="e.g. Chemistry" />
            </label>
            <label>
              Course code
              <input name="code" placeholder="e.g. CHEM 101" />
            </label>
            <label>
              Color
              <NativeSelect name="color" defaultValue="blue">
                <NativeSelectOption value="blue">Blue</NativeSelectOption>
                <NativeSelectOption value="violet">Purple</NativeSelectOption>
                <NativeSelectOption value="orange">Orange</NativeSelectOption>
                <NativeSelectOption value="teal">Teal</NativeSelectOption>
                <NativeSelectOption value="rose">Rose</NativeSelectOption>
              </NativeSelect>
            </label>
            <Button type="submit" disabled={busy}>
              <Plus size={16} /> Add course
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={eventDialog} onOpenChange={setEventDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a date</DialogTitle>
            <DialogDescription>
              Add an assignment, test, or personal course reminder.
            </DialogDescription>
          </DialogHeader>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              run(async () => {
                await mutate("event:create", {
                  title: form.get("title"),
                  courseId: form.get("courseId"),
                  dueAt: new Date(String(form.get("dueAt"))).toISOString(),
                  kind: form.get("kind"),
                  pointsPossible: form.get("pointsPossible"),
                  estimatedMinutes: form.get("estimatedMinutes"),
                  description: form.get("description"),
                });
                setEventDialog(false);
              }, "Date added.");
            }}
          >
            <label>
              Title
              <input name="title" required placeholder="e.g. Lab report" />
            </label>
            <label>
              Course
              <NativeSelect name="courseId">
                <NativeSelectOption value="">Personal</NativeSelectOption>
                {data?.courses.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <div className="form-row">
              <label>
                Due date and time
                <input type="datetime-local" name="dueAt" required />
              </label>
              <label>
                Type
                <NativeSelect name="kind">
                  <NativeSelectOption value="assignment">
                    Assignment
                  </NativeSelectOption>
                  <NativeSelectOption value="quiz">Quiz</NativeSelectOption>
                  <NativeSelectOption value="exam">Exam</NativeSelectOption>
                  <NativeSelectOption value="event">Event</NativeSelectOption>
                </NativeSelect>
              </label>
            </div>
            <div className="form-row">
              <label>
                Points possible
                <input type="number" name="pointsPossible" min="0" />
              </label>
              <label>
                Estimated minutes
                <input
                  type="number"
                  name="estimatedMinutes"
                  min="15"
                  max="600"
                  defaultValue={60}
                />
              </label>
            </div>
            <label>
              Details
              <textarea
                name="description"
                rows={3}
                placeholder="Instructions or topics to cover"
              />
            </label>
            <Button type="submit" disabled={busy}>
              <Plus size={16} /> Add date
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={connectDialog}
        onOpenChange={(open) => {
          setConnectDialog(open);
          if (!open) setFeedUrl("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect your Canvas calendar</DialogTitle>
            <DialogDescription>
              Import dates with a Canvas calendar feed or .ics file. Grades,
              course lists, and full instructions require school-approved Canvas
              sign-in. Each import reconciles your previous feed; always use the
              same calendar.
            </DialogDescription>
          </DialogHeader>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              importFeed();
            }}
          >
            <label>
              Canvas calendar feed
              <input
                type="password"
                autoComplete="off"
                value={feedUrl}
                onChange={(event) => setFeedUrl(event.target.value)}
                placeholder="https://canvas.school.edu/feeds/calendars/..."
              />
            </label>
            <Button type="submit" disabled={busy || !feedUrl.trim()}>
              <RefreshCw size={16} /> Import calendar
            </Button>
          </form>
          <div className="form-stack">
            <label>
              Or upload the .ics file
              <input
                type="file"
                accept=".ics,text/calendar"
                disabled={busy}
                onChange={(event) =>
                  importCalendarFile(event.target.files?.[0])
                }
              />
            </label>
            <p className="dialog-note">
              If Canvas blocks the link here, open it in your browser, download
              the calendar file, and upload it above.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setConnectDialog(false);
              setCourseDialog(true);
            }}
          >
            Add a course manually
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={reminderDialog} onOpenChange={setReminderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reminders</DialogTitle>
            <DialogDescription>
              Work due within the next {data?.settings?.reminder_hours || 24}{" "}
              hours.
            </DialogDescription>
          </DialogHeader>
          <div className="reminder-list">
            {reminders.length ? (
              reminders.map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    setReminderDialog(false);
                    setSelectedEventId(e.id);
                  }}
                >
                  <span>{e.title}</span>
                  <small>{dateTime(e.due_at)}</small>
                </button>
              ))
            ) : (
              <p>You are clear for now.</p>
            )}
          </div>
          <p className="dialog-note">
            In-app reminders require this site to be open. Choose timing and
            optional browser delivery in Study plan.
          </p>
        </DialogContent>
      </Dialog>
    </main>
  );
}
