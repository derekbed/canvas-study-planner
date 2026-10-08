"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Calculator, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Workspace } from "@/lib/client-types";
import { courseFor, dateTime } from "@/lib/client-types";
import { priorityScore, projectGrade } from "@/lib/grades";

export default function GradesView({ data, onEvent, onMutate }: { data: Workspace; onEvent: (id: string) => void; onMutate: (action: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [courseId, setCourseId] = useState(data.courses[0]?.id || "");
  const [weights,setWeights]=useState<{name:string;weight:number}[]>([]);
  const [target, setTarget] = useState(90);
  const [eventId, setEventId] = useState("");
  const [score, setScore] = useState(85);
  const course = data.courses.find(c => c.id === courseId) || data.courses[0];
  useEffect(() => { if (course) { setTarget(course.target_grade); setEventId(""); setWeights(Object.entries(JSON.parse(course.grade_weights||"{}")).map(([name,weight])=>({name,weight:Number(weight)}))); } }, [course?.id, course?.target_grade]);
  if (!course) return <div className="content-panel empty-panel"><Calculator size={28} /><h2>Choose a course first</h2><p>Your grade scenarios will appear after you add course work.</p></div>;
  const projection = projectGrade(course, data.events);
  const assignments = data.events.filter(e => e.course_id === course.id && e.points_possible != null && e.points_possible > 0);
  const selected = assignments.find(e => e.id === eventId);
  const scenario = selected ? projectGrade(course, data.events, { [selected.id]: (selected.points_possible || 0) * score / 100 }) : null;
  const priorities = data.events.filter(e => e.status !== "done" && e.course_id === course.id).sort((a,b) => priorityScore(b, course) - priorityScore(a, course)).slice(0, 6);
  const save = async () => { try { await onMutate("course:update", { id: course.id, targetGrade: target, currentGrade: course.current_grade, gradeWeights: Object.fromEntries(weights.filter(w=>w.name.trim()).map(w=>[w.name.trim(),w.weight])) }); toast.success("Target and grading categories updated."); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save."); } };
  return <div className="grades-layout"><section className="content-panel grade-main"><div className="panel-title"><div><p className="eyebrow">GRADE LAB</p><h2>Find a path to your goal</h2></div><NativeSelect value={course.id} onChange={event => setCourseId(event.target.value)} aria-label="Choose course">{data.courses.map(c => <NativeSelectOption value={c.id} key={c.id}>{c.name}</NativeSelectOption>)}</NativeSelect></div>
    <div className="grade-metrics"><div><span>Current grade</span><strong>{course.current_grade == null ? "—" : `${course.current_grade.toFixed(1)}%`}</strong><small>{course.current_grade == null ? "Enter it in the course page" : "From Canvas or entered manually"}</small></div><div><span>Target grade</span><strong>{course.target_grade}%</strong><small>Your goal for this course</small></div><div><span>Needed average</span><strong>{projection.needed == null ? projection.possible === false ? "100%+" : "—" : `${projection.needed.toFixed(1)}%`}</strong><small>On listed ungraded work</small></div></div>
    <div className="grade-explanation"><Target size={20} /><div><strong>{projection.possible === false ? "Target is out of reach on listed work" : projection.needed != null ? "Here is the path" : "More scores are needed"}</strong><p>{projection.explanation}</p></div></div>
    <div className="grade-input-panel"><div><h3>Change your target</h3><p>See how the required average changes.</p></div><div className="target-edit"><input aria-label="Target percentage" type="number" min="0" max="100" value={target} onChange={event => setTarget(Number(event.target.value))} /><span>%</span><Button onClick={save}>Save target</Button></div></div>
    <div className="scenario-panel"><h3>Weighted grading categories</h3><p>Enter the syllabus weights, totaling 100%. Leave empty for a points-based course. Assign matching categories in each date’s details.</p>{weights.map((w,i)=><div className="form-row" key={i}><label>Category<input value={w.name} onChange={e=>setWeights(old=>old.map((v,n)=>n===i?{...v,name:e.target.value}:v))}/></label><label>Weight %<input type="number" min="0" max="100" value={w.weight} onChange={e=>setWeights(old=>old.map((v,n)=>n===i?{...v,weight:+e.target.value}:v))}/></label><Button variant="ghost" onClick={()=>setWeights(old=>old.filter((_,n)=>n!==i))}>Remove</Button></div>)}<div className="heading-actions"><Button variant="outline" onClick={()=>setWeights(old=>[...old,{name:"",weight:0}])}>Add category</Button><Button onClick={save}>Save grading rules</Button><span>Total: {weights.reduce((n,w)=>n+w.weight,0)}%</span></div></div>
    <div className="scenario-panel"><div className="summary-title"><Calculator size={19} /><h3>What if you score…</h3></div><p>Try a score on one assignment to see what you would need on the rest.</p><div className="scenario-controls"><NativeSelect value={eventId} onChange={event => setEventId(event.target.value)} aria-label="Assignment"><NativeSelectOption value="">Choose an assignment</NativeSelectOption>{assignments.map(e => <NativeSelectOption value={e.id} key={e.id}>{e.title}</NativeSelectOption>)}</NativeSelect><label><input type="number" aria-label="What if score" min="0" max="100" value={score} onChange={event => setScore(Math.max(0, Math.min(100, Number(event.target.value))))} />%</label></div>{scenario && <div className="scenario-result"><TrendingUp size={18} /><span>{scenario.explanation}</span></div>}</div>
    <p className="grade-disclaimer">Estimates use the assignments and grading groups available here. Hidden grades, unlisted work, drop rules, and extra credit can change the outcome.</p>
  </section><aside className="content-panel priority-panel"><p className="eyebrow">PRIORITY</p><h3>Work that matters now</h3><div>{priorities.length ? priorities.map(e => <button key={e.id} onClick={() => onEvent(e.id)}><span className={`course-dot ${courseFor(data, e.course_id)?.color || "blue"}`} /><span><strong>{e.title}</strong><small>{dateTime(e.due_at)}{e.points_possible ? ` · ${e.points_possible} pts` : ""}</small></span><ArrowUpRight size={16} /></button>) : <p className="empty-inline">No unfinished work listed.</p>}</div><p className="priority-note">Ordered by due date, point value, target gap, and estimated effort.</p></aside></div>;
}
