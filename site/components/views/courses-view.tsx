"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, FileText, Plus, Target, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Workspace } from "@/lib/client-types";
import { dateTime } from "@/lib/client-types";
import MaterialReview from "@/components/views/material-review";
import { projectGrade } from "@/lib/grades";

type CourseContext = { brief: string; status: string; sourceMaterialId: string | null;
  facts: { key: string; value: string; sourceLabel: string; origin: string }[] };
const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b[a-z]/g, letter => letter.toUpperCase());
const factOrder = ["exam_dates", "grading_weights", "assignment_schedule", "course_topics", "late_policy", "readings", "attendance_policy", "academic_integrity_policy", "collaboration_policy", "office_hours", "instructor_contact"];
const factLabels: Record<string, string> = { exam_dates: "Exams & quizzes", grading_weights: "Assignment weighting", assignment_schedule: "Assignments & due dates", course_topics: "Topics covered", late_policy: "Late work", readings: "Readings", attendance_policy: "Attendance", academic_integrity_policy: "Academic integrity & AI", collaboration_policy: "Collaboration", office_hours: "Office hours", instructor_contact: "Instructor contact" };

export default function CoursesView({ data, selectedCourseId, onSelectCourse, onEvent, onNewCourse, onNewEvent, onRefresh, onMutate }: {
  data: Workspace; selectedCourseId: string; onSelectCourse: (id: string) => void; onEvent: (id: string) => void; onNewCourse: () => void; onNewEvent: () => void;
  onRefresh: () => Promise<void>; onMutate: (action: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [target, setTarget] = useState(90);
  const [current, setCurrent] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("syllabus");
  const [analyzeId,setAnalyzeId]=useState<string|null>(null);
  const [uploading, setUploading] = useState(false);
  const [context, setContext] = useState<CourseContext | null>(null);
  const [contextBusy, setContextBusy] = useState(false);
  const course = data.courses.find(c => c.id === selectedCourseId) || data.courses[0];
  useEffect(() => { if (course) { setName(course.name); setTarget(course.target_grade); setCurrent(course.current_grade == null ? "" : String(course.current_grade)); } }, [course?.id, course?.name, course?.target_grade, course?.current_grade]);
  useEffect(() => {
    if (!course) return;
    let active = true;
    setContext(null);
    fetch(`/api/courses/${encodeURIComponent(course.id)}/context`).then(response => response.json() as Promise<CourseContext>)
      .then(result => { if (active) setContext(result); }).catch(() => { if (active) setContext(null); });
    return () => { active = false; };
  }, [course?.id]);
  if (!course) return <div className="content-panel empty-panel"><BookOpen size={28} /><h2>No courses yet</h2><p>Add a course or connect Canvas to bring your coursework here.</p><Button onClick={onNewCourse}><Plus size={16} /> Add a course</Button></div>;
  const assignments = data.events.filter(e => e.course_id === course.id).sort((a,b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  const materials = data.materials.filter(m => m.course_id === course.id);
  const factGroups = [...(context?.facts || []).filter(fact => fact.key !== "course_overview").reduce((groups, fact) => {
    const entries = groups.get(fact.key) || [];
    entries.push(fact);
    groups.set(fact.key, entries);
    return groups;
  }, new Map<string, CourseContext["facts"]>())].sort(([left], [right]) => {
    const leftIndex = factOrder.indexOf(left), rightIndex = factOrder.indexOf(right);
    return (leftIndex < 0 ? factOrder.length : leftIndex) - (rightIndex < 0 ? factOrder.length : rightIndex) || left.localeCompare(right);
  });
  const projection = projectGrade(course, data.events);
  const saveGrade = async () => {
    try { await onMutate("course:update", { id: course.id, targetGrade: target, currentGrade: current, gradeWeights: JSON.parse(course.grade_weights || "{}") }); toast.success("Grade target saved."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not save grade target."); }
  };
  const saveName = async () => {
    try { await onMutate("course:rename", { id: course.id, name }); toast.success("Course name updated."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not rename course."); }
  };
  const buildContext = async (id: string) => {
    setContextBusy(true);
    try {
      const response = await fetch(`/api/materials/${encodeURIComponent(id)}/context`, { method: "POST" });
      const result = await response.json() as CourseContext & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not build course context.");
      setContext(result);
      toast.success("Course context is ready with sourced facts.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not build course context."); }
    finally { setContextBusy(false); }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Files must be under 20 MB.");
      const form = new FormData(); form.append("file", file); form.append("courseId", course.id); form.append("kind", kind);
      const response = await fetch("/api/materials", { method: "POST", body: form });
      const result = await response.json() as { error?: string; indexed?: boolean };
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      await onRefresh();
      toast.success(result.indexed ? "File added to study context." : "File saved. No readable text was found in it.");
      if (kind === "syllabus" && result.indexed && data.preferences.consent && "id" in result && typeof result.id === "string")
        await buildContext(result.id);
    } catch (error) { toast.error(error instanceof Error ? error.message : "File could not be uploaded."); }
    finally { setUploading(false); }
  };
  const remove = async (id: string) => {
    const response = await fetch(`/api/materials/${encodeURIComponent(id)}`, { method: "DELETE" });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error || "Could not remove file.");
    await onRefresh();
  };
  return <div className="course-layout">
    <nav className="course-list" aria-label="Courses"><div className="course-list-head"><p className="eyebrow">COURSES</p><Button size="icon-sm" variant="ghost" onClick={onNewCourse} aria-label="Add a course"><Plus size={17} /></Button></div>{data.courses.map(c => <button key={c.id} onClick={() => onSelectCourse(c.id)} className={`course-choice ${course.id === c.id ? "active" : ""}`}>{c.image_url ? <img className="course-icon-image" src={c.image_url} alt="" /> : <span className={`course-icon ${c.color}`}>{c.name[0]}</span>}<span><strong>{c.name}</strong><small>{c.code || (c.source === "canvas" ? "Canvas course" : "Manual course")}</small></span></button>)}</nav>
    <div className="course-main">
      <div className="course-hero">{course.image_url && <img className="course-hero-image" src={course.image_url} alt="" />}<div><span className={`course-kicker ${course.color}`}>{course.code || "COURSE"}</span><h2>{course.name}</h2><p>{course.source === "canvas" ? "Synced with Canvas" : course.source === "demo" ? "Sample course" : "Added manually"}</p><div className="course-name-edit"><input aria-label="Course display name" value={name} maxLength={120} onChange={event => setName(event.target.value)} /><Button variant="outline" size="sm" onClick={saveName} disabled={!name.trim() || name.trim() === course.name}>Save name</Button></div></div><Button variant="outline" onClick={onNewEvent}><Plus size={16} /> Add a date</Button></div>
      <div className="course-summary-grid"><section className="summary-panel"><div className="summary-title"><Target size={18} /><h3>Grade target</h3></div><div className="grade-entry-row"><label>Goal <span>%</span><input type="number" min="0" max="100" value={target} onChange={event => setTarget(Number(event.target.value))} /></label><label>Current <span>%</span><input type="number" min="0" max="100" value={current} onChange={event => setCurrent(event.target.value)} placeholder="—" /></label><Button onClick={saveGrade} size="sm">Save</Button></div><p>{projection.explanation}</p></section><section className="summary-panel"><div className="summary-title"><UploadCloud size={18} /><h3>Course materials</h3></div><p>Upload a syllabus, textbook excerpt, or notes. Use materials you are authorized to share. Excerpts and notes are enough; full textbooks are not required.</p><div className="upload-row"><NativeSelect aria-label="Material type" value={kind} onChange={event => setKind(event.target.value)}><NativeSelectOption value="syllabus">Syllabus</NativeSelectOption><NativeSelectOption value="textbook">Textbook</NativeSelectOption><NativeSelectOption value="notes">Notes</NativeSelectOption></NativeSelect><label className="upload-button"><UploadCloud size={16} /> {uploading ? "Reading file…" : "Upload PDF or text"}<input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; upload(file); event.target.value = ""; }} /></label></div></section></div>
      {context?.status === "indexed" && <section className="content-panel course-context"><div className="panel-title"><div><p className="eyebrow">COURSE CONTEXT</p><h3>Syllabus details</h3></div><span>{context.facts.length} sourced facts</span></div><div className="context-facts">{factGroups.map(([key, facts]) => <section className="context-fact-group" key={key}><h4>{factLabels[key] || titleCase(key)}</h4>{facts.map((fact, index) => <p className="context-fact-entry" key={`${fact.sourceLabel}-${index}`}>{fact.value}<small>{fact.origin === "student" ? "Student provided" : fact.sourceLabel}</small></p>)}</section>)}</div>{context.brief && <div className="context-summary"><h4>Course overview</h4><p className="context-brief">{context.brief}</p></div>}</section>}
      <div className="course-bottom-grid"><section className="content-panel"><div className="panel-title"><div><p className="eyebrow">UPCOMING WORK</p><h3>Assignments and dates</h3></div><span>{assignments.length} items</span></div>{assignments.length ? assignments.map(e => <button className="assignment-row" onClick={() => onEvent(e.id)} key={e.id}><span className={`course-dot ${course.color}`} /><span><strong>{e.title}</strong><small>{dateTime(e.due_at)} · {e.kind}{e.points_possible != null ? ` · ${e.points_possible} pts` : ""}</small></span><span className={`status-tag ${e.status}`}>{e.status}</span><ArrowUpRight size={16} /></button>) : <p className="empty-inline">No dates for this course yet.</p>}</section><section className="content-panel materials-panel"><div className="panel-title"><div><p className="eyebrow">LIBRARY</p><h3>Uploaded materials</h3></div><span>{materials.length} files</span></div>{materials.length ? materials.map(m => <div className="material-row" key={m.id}><FileText size={19} /><span><a href={`/api/materials/${encodeURIComponent(m.id)}`}>{m.name}</a><small>{m.kind} · {m.preview ? "Ready for chat" : "No readable text"}</small></span>{m.kind === "syllabus" && (m.preview || /\.pdf$/i.test(m.name)) && <button disabled={contextBusy} onClick={()=>buildContext(m.id)}>{context?.sourceMaterialId === m.id ? "Refresh context" : "Build context"}</button>}<button onClick={()=>setAnalyzeId(m.id)} aria-label={`Review dates and rules in ${m.name}`}>Review</button><button aria-label={`Remove ${m.name}`} onClick={() => remove(m.id).catch(error => toast.error(error.message))}><Trash2 size={16} /></button></div>) : <p className="empty-inline">Your uploaded course files will appear here.</p>}</section></div>
    {analyzeId && <MaterialReview id={analyzeId} courseId={course.id} onClose={()=>setAnalyzeId(null)} onMutate={onMutate} />}
    </div>
  </div>;
}
