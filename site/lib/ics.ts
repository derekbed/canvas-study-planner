export type IcsEntry = { uid: string; title: string; description: string; startsAt: string; url: string | null; cancelled: boolean; courseHint: string };
const unescapeIcs = (value: string) => value.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
export function safePublicUrl(value: string | null) {
  if (!value) return null;
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && !/\/feeds\/|\.ics(?:$|\?)/i.test(u.href) ? u.href : null; } catch { return null; }
}
function parseDate(raw: string, zone?: string) {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) throw new Error("Invalid calendar date");
  const values = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] || 23), Number(m[5] || 59), Number(m[6] || 0)];
  if(values[1]<1||values[1]>12||values[2]<1||values[2]>new Date(Date.UTC(values[0],values[1],0)).getUTCDate()||values[3]>23||values[4]>59||values[5]>59)throw new Error("Invalid calendar date");
  let stamp = Date.UTC(values[0], values[1]-1, values[2], values[3], values[4], values[5]);
  if (zone && !m[7]) {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    for (let i=0;i<3;i++) {
      const p = Object.fromEntries(fmt.formatToParts(new Date(stamp)).map(x => [x.type, x.value]));
      const rendered = Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
      const diff = Date.UTC(values[0],values[1]-1,values[2],values[3],values[4],values[5]) - rendered;
      stamp += diff; if (!diff) break;
    }
  }
  return new Date(stamp).toISOString();
}
export function parseIcsCalendar(input: string, timeZone = "UTC"): IcsEntry[] {
  if (!input.includes("BEGIN:VCALENDAR") || !input.includes("END:VCALENDAR")) throw new Error("Incomplete calendar");
  const lines = input.replace(/\r?\n[ \t]/g, "").split(/\r?\n/).map(x=>x.trim());
  const entries = new Map<string,IcsEntry>();
  let current: Record<string,string> | null = null, zone: string | undefined;
  const defaultZone = lines.find(x=>x.startsWith("X-WR-TIMEZONE:"))?.slice(15) || timeZone;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { if(current) throw new Error("Malformed calendar"); current={}; zone=defaultZone; continue; }
    if (line === "END:VEVENT") {
      if (!current) throw new Error("Malformed calendar");
      if (current.RRULE) throw new Error("Recurring calendars are unsupported; use a Canvas assignment feed.");
      const cancelled = current.STATUS === "CANCELLED";
      const title = unescapeIcs(current.SUMMARY || "");
      const uid = current.UID;
      if (!uid || (!cancelled && (!title || !current.DTSTART))) throw new Error("Calendar event is incomplete");
      const startsAt = current.DTSTART ? parseDate(current.DTSTART,zone) : "1970-01-01T00:00:00.000Z";
      const key = unescapeIcs(uid) + (current["RECURRENCE-ID"] ? `#${current["RECURRENCE-ID"]}` : "");
      entries.set(key,{uid:key,title,description:unescapeIcs(current.DESCRIPTION || "").replace(/https?:\/\/\S*\/feeds\/\S*/gi,"[private feed link removed]"),startsAt,url:safePublicUrl(current.URL || null),cancelled,courseHint:unescapeIcs(current["X-WR-CALNAME"] || current.CATEGORIES || "")});
      current=null; continue;
    }
    if (!current) continue;
    const colon=line.indexOf(":"); if(colon<0) continue;
    const head=line.slice(0,colon), key=head.split(";")[0].toUpperCase();
    current[key]=line.slice(colon+1);
    if(key==="DTSTART") zone=head.match(/TZID="?([^;"]+)/)?.[1] || defaultZone;
  }
  if(current || entries.size>500) throw new Error("Calendar is incomplete or exceeds 500 events");
  return [...entries.values()];
}
export function matchCourse(entry: IcsEntry, courses: {id:string;canvas_id:string|null;name:string;code:string}[]) {
  const canvasId=entry.url?.match(/\/courses\/(\d+)/)?.[1];
  if(canvasId) { const exact=courses.filter(c=>c.canvas_id===canvasId); if(exact.length===1) return exact[0].id; }
  const hint=entry.courseHint.toLowerCase();
  const labels=[...entry.title.matchAll(/\[([^\]]+)\]/g)].map(m=>m[1].toLowerCase());
  const matches=courses.filter(c=>[c.name,c.code].filter(Boolean).some(n=>n.toLowerCase()===hint || labels.includes(n.toLowerCase())));
  return matches.length===1 ? matches[0].id : null;
}
const escape = (s:string) => s.replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");
export function exportCalendar(events:{id:string;title:string;description:string;due_at:string;status:string}[]) {
  const stamp=(s:string)=>new Date(s).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z/,"Z");
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Coursewise//Study calendar//EN","CALSCALE:GREGORIAN",...events.flatMap(e=>["BEGIN:VEVENT",`UID:${e.id}@coursewise`,`DTSTAMP:${stamp(new Date().toISOString())}`,`DTSTART:${stamp(e.due_at)}`,`SUMMARY:${escape(e.title)}`,`DESCRIPTION:${escape(e.description)}`,"END:VEVENT"]),"END:VCALENDAR"];
  return lines.map(line=>{let out="",bytes=0; for(const char of line){const size=new TextEncoder().encode(char).length;if(bytes+size>73){out+="\r\n ";bytes=1;}out+=char;bytes+=size;}return out;}).join("\r\n")+"\r\n";
}
