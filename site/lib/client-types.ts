export type Course = { id: string; canvas_id: string | null; name: string; code: string; color: string; image_url: string; target_grade: number; current_grade: number | null; grade_weights: string; source: string };
export type Event = { id: string; course_id: string | null; title: string; description: string; due_at: string; kind: string; points_possible: number | null; points_earned: number | null; status: string; source: string; url: string | null; estimated_minutes: number; grade_group: string };
export type Material = { id: string; course_id: string; name: string; kind: string; mime_type: string; preview: string; created_at: string };
export type StudyBlock = { id: string; course_id: string | null; event_id: string | null; starts_at: string; minutes: number; status: string };
export type Settings = { available_days: string; hours_per_week: number; reminder_hours: number };
export type Workspace = { preferences: Preferences; calendarImport: {last_import_at:string;summary:string}|null; cards:Flashcard[]; focusSessions:{id:string;course_id:string|null;minutes:number;completed_at:string}[]; gradeHistory:{course_id:string;grade:number;recorded_at:string}[]; courses: Course[]; events: Event[]; materials: Material[]; blocks: StudyBlock[]; settings: Settings | null; connection: { base_url: string; last_sync_at: string | null } | null; aiAvailable: boolean; canvasAvailable: boolean };
export function courseFor(data: Workspace, id: string | null) { return data.courses.find(c => c.id === id); }
export function plain(value: string) { return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); }
export function dateTime(value: string) { return new Date(value).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
export type Preferences = { initialized?: boolean; startHour?: number; endHour?: number; sessionMinutes?: number; browserAlerts?: boolean; consent?: boolean };
export type Flashcard = { id:string;course_id:string|null;question:string;answer:string;source:string;due_at:string;interval_days:number;reviews:number };
