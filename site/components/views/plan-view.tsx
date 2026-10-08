"use client";

import { useMemo, useState } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { ArrowUpRight, CalendarClock, Check, Clock3, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Event, Workspace } from "@/lib/client-types";
import { courseFor, dateTime } from "@/lib/client-types";
import { planWeek } from "@/lib/planner";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export default function PlanView({ data, onEvent, onMutate }: { data: Workspace; onEvent: (id: string) => void; onMutate: (action: string, payload: Record<string, unknown>) => Promise<void> }) {
  const initialDays = useMemo(() => { try { return JSON.parse(data.settings?.available_days || "[1,2,3,4,5]") as number[]; } catch { return [1,2,3,4,5]; } }, [data.settings?.available_days]);
  const [days, setDays] = useState(initialDays);
  const [hours, setHours] = useState(data.settings?.hours_per_week || 8);
  const [reminderHours, setReminderHours] = useState(data.settings?.reminder_hours || 24);
  const [startHour,setStartHour]=useState(data.preferences.startHour??17);
  const [endHour,setEndHour]=useState(data.preferences.endHour??21);
  const [sessionMinutes,setSessionMinutes]=useState(data.preferences.sessionMinutes??45);
  const [reschedule,setReschedule]=useState<string|null>(null);
  const [busy, setBusy] = useState(false);
  const blocks = data.blocks.filter(b => b.status!=="done" || Date.parse(b.starts_at) > Date.now() - 7*86_400_000).sort((a,b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const total = blocks.reduce((n,b) => n + b.minutes, 0);
  const toggleDay = (day: number) => setDays(previous => previous.includes(day) ? previous.filter(d => d !== day) : [...previous, day].sort());
  const generate = async () => {
    if(endHour<=startHour)return toast.error("End time must follow start time.");
    if (!days.length) return toast.error("Choose at least one study day.");
    setBusy(true);
    try {
      const next = planWeek(data, days, hours,startHour,endHour,sessionMinutes);
      await onMutate("preferences:update",{startHour,endHour,sessionMinutes});
      await onMutate("settings:update", { availableDays: days, hoursPerWeek: hours, reminderHours });
      await onMutate("plan:save", { blocks: next });
      const scheduled=next.reduce((n,b)=>n+b.minutes,0);
      const required=data.events.filter(e=>e.status!=="done"&&Date.parse(e.due_at)>Date.now()).reduce((n,e)=>n+e.estimated_minutes,0);
      if(scheduled<required)toast.info("Some estimated work did not fit. Increase availability or reschedule remaining work.");
      toast.success(next.length ? `Planned ${next.length} study block${next.length === 1 ? "" : "s"}.` : "No upcoming work fits this week yet.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create plan."); }
    finally { setBusy(false); }
  };
  const saveSettings = async () => {
    try { await onMutate("preferences:update",{startHour,endHour,sessionMinutes}); await onMutate("settings:update", { availableDays: days, hoursPerWeek: hours, reminderHours }); toast.success("Preferences saved."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not save preferences."); }
  };
  const enableAlerts = async () => {
    if (!("Notification" in window)) return toast.error("This browser does not support notifications.");
    const result = await Notification.requestPermission();
    if(result==="granted")await onMutate("preferences:update",{browserAlerts:true}).catch(e=>toast.error(e.message));
    toast[result === "granted" ? "success" : "info"](result === "granted" ? "Browser alerts enabled while this site is open." : "You can still use in-app reminders.");
  };
  return <div className="plan-layout"><section className="content-panel plan-main"><div className="panel-title"><div><p className="eyebrow">THIS WEEK</p><h2>Your study blocks</h2></div><span>{(total / 60).toFixed(1)} hours planned</span></div><div className="plan-intro"><Sparkles size={19} /><p>The plan gives earlier and higher impact assignments time before they are due. You can rebuild it whenever your week changes.</p></div>
    {blocks.length ? <div className="block-list">{blocks.map(block => { const event = data.events.find(e => e.id === block.event_id); const course = courseFor(data, block.course_id); return <div className={`block-row ${block.status === "done" ? "done" : ""}`} key={block.id}><div className="block-time"><strong>{format(new Date(block.starts_at), "EEE d")}</strong><span>{format(new Date(block.starts_at), "h:mm a")}</span></div><span className={`course-dot ${course?.color || "blue"}`} /><div className="block-description"><strong>{event?.title || "Study block"}</strong><small>{course?.name || "Personal"} · {block.minutes} min{event ? ` · due ${dateTime(event.due_at)}` : ""}</small></div>{event && <button aria-label={`Open ${event.title}`} onClick={() => onEvent(event.id)}><ArrowUpRight size={17} /></button>}{block.status!=="done"&&<button onClick={()=>setReschedule(reschedule===block.id?null:block.id)}>{Date.parse(block.starts_at)+block.minutes*60000<Date.now()?"Missed · reschedule":"Reschedule"}</button>}{reschedule===block.id&&<form className="reschedule-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await onMutate("plan:reschedule",{id:block.id,startsAt:new Date(String(f.get("date"))).toISOString()});setReschedule(null);}catch(e){toast.error(e instanceof Error?e.message:"Could not reschedule.");}}}><label>New study time<input type="datetime-local" name="date" required/></label><Button size="sm">Move</Button></form>}{block.status !== "done" && <Button size="sm" variant="outline" onClick={() => onMutate("plan:complete", { id: block.id }).catch(error => toast.error(error.message))}><Check size={15} /> Done</Button>}</div>; })}</div> : <div className="empty-plan"><CalendarClock size={31} /><h3>No study blocks yet</h3><p>Choose your available days and build a plan for upcoming work.</p></div>}
  </section><aside className="content-panel plan-settings"><p className="eyebrow">PREFERENCES</p><h3>Make room to study</h3><p>Choose when you can work. Your plan stays within these hours.</p><div className="setting-group"><strong>Study days</strong><div className="day-checks">{dayNames.map((name, day) => <label key={name}><Checkbox checked={days.includes(day)} onCheckedChange={() => toggleDay(day)} /><span>{name}</span></label>)}</div></div><div className="form-row"><label>Start hour (0–23)<input type="number" min="0" max="23" value={startHour} onChange={e=>setStartHour(+e.target.value)}/></label><label>End hour (1–24)<input type="number" min="1" max="24" value={endHour} onChange={e=>setEndHour(+e.target.value)}/></label></div><label>Session length (minutes)<input type="number" min="15" max="90" value={sessionMinutes} onChange={e=>setSessionMinutes(Math.max(15,Math.min(90,+e.target.value)))}/></label><small>Five-minute breaks separate sessions. Times use your device time zone.</small><div className="setting-group"><label htmlFor="hours">Hours available this week</label><input id="hours" type="number" min="1" max="40" value={hours} onChange={event => setHours(Math.max(1, Math.min(40, Number(event.target.value))))} /></div><div className="setting-group"><label htmlFor="reminder">Remind me this many hours before due dates</label><input id="reminder" type="number" min="1" max="168" value={reminderHours} onChange={event => setReminderHours(Math.max(1, Math.min(168, Number(event.target.value))))} /></div><Button onClick={generate} disabled={busy} className="plan-generate"><Sparkles size={16} /> {busy ? "Building…" : "Build my week"}</Button><Button variant="ghost" onClick={saveSettings}>Save preferences</Button><label className="consent"><input type="checkbox" checked={!!data.preferences.browserAlerts} onChange={e=>{if(e.target.checked)void enableAlerts();else void onMutate("preferences:update",{browserAlerts:false}).catch(e=>toast.error(e.message));}}/>Optional browser notifications</label><button className="notification-link" onClick={enableAlerts}><Clock3 size={16} /> Enable browser alerts</button><small className="setting-note">Browser alerts work while this site is open. The bell always shows upcoming reminders.</small></aside></div>;
}
