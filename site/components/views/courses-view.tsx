"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, FileText, Plus, Target, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Workspace } from "@/lib/client-types";
import { dateTime } from "@/lib/client-types";
import { projectGrade } from "@/lib/grades";

async function extractText(file: File) {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return (await file.text()).slice(0, 500_000);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pieces: string[] = [];
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 200); pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pieces.push(content.items.map(item => "str" in item ? item.str : "").join(" "));
    if (pieces.join(" ").length >= 500_000) break;
  }
  return pieces.join("\n").slice(0, 500_000);
}

export default function CoursesView({ data, onEvent, onNewCourse, onNewEvent, onRefresh, onMutate }: {
  data: Workspace; onEvent: (id: string) => void; onNewCourse: () => void; onNewEvent: () => void;
  onRefresh: () => Promise<void>; onMutate: (action: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [selected, setSelected] = useState(data.courses[0]?.id || "");
  const [target, setTarget] = useState(90);
  const [current, setCurrent] = useState("");
  const [kind, setKind] = useState("syllabus");
  const [uploading, setUploading] = useState(false);
  const course = data.courses.find(c => c.id === selected) || data.courses[0];
  useEffect(() => { if (course) { setTarget(course.target_grade); setCurrent(course.current_grade == null ? "" : String(course.current_grade)); } }, [course?.id, course?.target_grade, course?.current_grade]);
  if (!course) return <div className="content-panel empty-panel"><BookOpen size={28} /><h2>No courses yet</h2><p>Add a course or connect Canvas to bring your coursework here.</p><Button onClick={onNewCourse}><Plus size={16} /> Add a course</Button></div>;
  const assignments = data.events.filter(e => e.course_id === course.id).sort((a,b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  const materials = data.materials.filter(m => m.course_id === course.id);
  const projection = projectGrade(course, data.events);
  const saveGrade = async () => {
    try { await onMutate("course:update", { id: course.id, targetGrade: target, currentGrade: current, gradeWeights: JSON.parse(course.grade_weights || "{}") }); toast.success("Grade target saved."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not save grade target."); }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Files must be under 20 MB.");
      const extractedText = await extractText(file);
      const form = new FormData(); form.append("file", file); form.append("courseId", course.id); form.append("kind", kind); form.append("extractedText", extractedText);
      const response = await fetch("/api/materials", { method: "POST", body: form });
      const result = await response.json() as { error?: string; indexed?: boolean };
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      await onRefresh();
      toast.success(result.indexed ? "File added to study context." : "File saved. No readable text was found in it.");
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
    <nav className="course-list" aria-label="Courses"><div className="course-list-head"><p className="eyebrow">COURSES</p><Button size="icon-sm" variant="ghost" onClick={onNewCourse} aria-label="Add a course"><Plus size={17} /></Button></div>{data.courses.map(c => <button key={c.id} onClick={() => setSelected(c.id)} className={`course-choice ${course.id === c.id ? "active" : ""}`}><span className={`course-icon ${c.color}`}>{c.name[0]}</span><span><strong>{c.name}</strong><small>{c.code || (c.source === "canvas" ? "Canvas course" : "Manual course")}</small></span></button>)}</nav>
    <div className="course-main">
      <div className="course-hero"><div><span className={`course-kicker ${course.color}`}>{course.code || "COURSE"}</span><h2>{course.name}</h2><p>{course.source === "canvas" ? "Synced with Canvas" : course.source === "demo" ? "Sample course" : "Added manually"}</p></div><Button variant="outline" onClick={onNewEvent}><Plus size={16} /> Add a date</Button></div>
      <div className="course-summary-grid"><section className="summary-panel"><div className="summary-title"><Target size={18} /><h3>Grade target</h3></div><div className="grade-entry-row"><label>Goal <span>%</span><input type="number" min="0" max="100" value={target} onChange={event => setTarget(Number(event.target.value))} /></label><label>Current <span>%</span><input type="number" min="0" max="100" value={current} onChange={event => setCurrent(event.target.value)} placeholder="—" /></label><Button onClick={saveGrade} size="sm">Save</Button></div><p>{projection.explanation}</p></section><section className="summary-panel"><div className="summary-title"><UploadCloud size={18} /><h3>Course materials</h3></div><p>Upload a syllabus, textbook excerpt, or notes. Readable text becomes context for study chat.</p><div className="upload-row"><NativeSelect value={kind} onChange={event => setKind(event.target.value)}><NativeSelectOption value="syllabus">Syllabus</NativeSelectOption><NativeSelectOption value="textbook">Textbook</NativeSelectOption><NativeSelectOption value="notes">Notes</NativeSelectOption></NativeSelect><label className="upload-button"><UploadCloud size={16} /> {uploading ? "Reading file…" : "Upload PDF or text"}<input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; upload(file); event.target.value = ""; }} /></label></div></section></div>
      <div className="course-bottom-grid"><section className="content-panel"><div className="panel-title"><div><p className="eyebrow">UPCOMING WORK</p><h3>Assignments and dates</h3></div><span>{assignments.length} items</span></div>{assignments.length ? assignments.map(e => <button className="assignment-row" onClick={() => onEvent(e.id)} key={e.id}><span className={`course-dot ${course.color}`} /><span><strong>{e.title}</strong><small>{dateTime(e.due_at)} · {e.kind}{e.points_possible != null ? ` · ${e.points_possible} pts` : ""}</small></span><span className={`status-tag ${e.status}`}>{e.status}</span><ArrowUpRight size={16} /></button>) : <p className="empty-inline">No dates for this course yet.</p>}</section><section className="content-panel materials-panel"><div className="panel-title"><div><p className="eyebrow">LIBRARY</p><h3>Uploaded materials</h3></div><span>{materials.length} files</span></div>{materials.length ? materials.map(m => <div className="material-row" key={m.id}><FileText size={19} /><span><a href={`/api/materials/${encodeURIComponent(m.id)}`}>{m.name}</a><small>{m.kind} · {m.preview ? "Ready for chat" : "No readable text"}</small></span><button aria-label={`Remove ${m.name}`} onClick={() => remove(m.id).catch(error => toast.error(error.message))}><Trash2 size={16} /></button></div>) : <p className="empty-inline">Your uploaded course files will appear here.</p>}</section></div>
    </div>
  </div>;
}
