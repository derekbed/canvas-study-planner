import { database, jsonError, now, userId, workspace, type Event, type Course } from "@/lib/server";
import { parseIcsCalendar, matchCourse } from "@/lib/ics";
function cleanFeedUrl(value: unknown) {
  if(typeof value!=="string") return null;
  try { const u=new URL(value.trim());
    if(u.protocol!=="https:" || u.username || u.password || u.port || !u.pathname.endsWith(".ics") || !u.pathname.startsWith("/feeds/calendars/") || !u.hostname.includes(".") || /(^|\.)(localhost|local|internal)$|^\d|:/.test(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}
export async function POST(request:Request) {
  const user=await userId(request); if(!user) return jsonError("Sign in to import a calendar.",401);
  let body:Record<string,unknown>;try{body=await request.json();}catch{return jsonError("Invalid request.");}
  const feedUrl=cleanFeedUrl(body.feedUrl);
  let text=typeof body.icsText==="string"?body.icsText:null;
  if(!feedUrl && !text) return jsonError("Paste an HTTPS Canvas Calendar Feed link, or upload its .ics file.");
  try {
    if(feedUrl) {
      const response=await fetch(feedUrl,{redirect:"manual",headers:{Accept:"text/calendar,text/plain,*/*","User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15"},signal:AbortSignal.timeout(15000)});
      if(response.status>=300 && response.status<400) return jsonError("Canvas redirected the feed. Download the .ics file from Canvas and upload it here; the feed URL was not followed for privacy.",400);
      if([401,403,404,410].includes(response.status)) return jsonError("This feed may be revoked, expired, or restricted by your school. Copy a fresh Calendar Feed link from Canvas or download and upload its .ics file.",403);
      if(!response.ok) return jsonError("Canvas could not provide the feed. Try later or upload its .ics file.",502);
      const reader=response.body?.getReader(); if(!reader) return jsonError("The calendar response was empty.");
      const decoder=new TextDecoder(); let size=0; text="";
      while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>5_000_000){await reader.cancel();return jsonError("Calendar files must be under 5 MB.");}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();
    }
    if(!text || text.length>5_000_000) return jsonError("Choose a calendar file under 5 MB.");
    let entries;try{entries=parseIcsCalendar(text,typeof body.timeZone==="string"?body.timeZone:"UTC");}catch{return jsonError("The calendar is incomplete, uses unsupported recurring events, or exceeds 500 items. Export a fresh Canvas assignment calendar. Existing dates were kept.");}
    const db=database();
    const old=(await db.prepare("SELECT * FROM events WHERE user_id=? AND source='ics'").bind(user).all<Event>()).results;
    const courses=(await db.prepare("SELECT * FROM courses WHERE user_id=?").bind(user).all<Course>()).results;
    const active=entries.filter(e=>!e.cancelled), keys=new Set(active.map(e=>`ics:${e.uid}`));
    const removed=old.filter(e=>!keys.has(e.canvas_id || ""));
    let added=0,updated=0,unchanged=0;
    const statements=active.map(entry=>{
      const key=`ics:${entry.uid}`,existing=old.find(e=>e.canvas_id===key), courseId=existing?.course_id || matchCourse(entry,courses);
      if(!existing)added++;else if(existing.title!==entry.title.slice(0,180)||existing.description!==entry.description.slice(0,10000)||existing.due_at!==entry.startsAt||existing.url!==entry.url||existing.course_id!==courseId)updated++;else unchanged++;
      return db.prepare("INSERT INTO events (id,user_id,course_id,canvas_id,title,description,due_at,kind,status,source,url,estimated_minutes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,canvas_id) DO UPDATE SET title=excluded.title,description=excluded.description,due_at=excluded.due_at,url=excluded.url,course_id=excluded.course_id")
        .bind(crypto.randomUUID(),user,courseId,key,entry.title.slice(0,180),entry.description.slice(0,10000),entry.startsAt,"event","upcoming","ics",entry.url,30,now());
    });
    const activeKeys=JSON.stringify([...keys]);
    statements.push(db.prepare("DELETE FROM study_blocks WHERE user_id=? AND status='planned' AND event_id IN (SELECT id FROM events WHERE user_id=? AND source='ics' AND canvas_id NOT IN (SELECT value FROM json_each(?)))").bind(user,user,activeKeys));
    statements.push(db.prepare("DELETE FROM events WHERE user_id=? AND source='ics' AND canvas_id NOT IN (SELECT value FROM json_each(?))").bind(user,activeKeys));
    const summary={added,updated,removed:removed.length,unchanged};
    statements.push(db.prepare("INSERT INTO calendar_imports (user_id,last_import_at,summary) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET last_import_at=excluded.last_import_at,summary=excluded.summary").bind(user,now(),JSON.stringify(summary)));
    // One transaction: a failed replacement leaves the previous import intact.
    await db.batch(statements);
    return Response.json({...await workspace(user),summary});
  }catch{
    return jsonError("Import failed. Your existing dates were kept. Try a fresh Canvas feed or upload the .ics file; school restrictions or redirects may prevent a direct download.",503);
  }
}
