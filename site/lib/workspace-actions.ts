import { bucket, database, cleanText, jsonError, now, numberIn } from "./server";
export async function extraAction(user:string, action:string, body:Record<string,unknown>):Promise<Response | boolean> {
  const db=database(), id=cleanText(body.id,150);
  const courseId=cleanText(body.courseId,150);
  if(courseId && !await db.prepare("SELECT id FROM courses WHERE id=? AND user_id=?").bind(courseId,user).first()) return jsonError("Course not found.",404);
  if(action==="preferences:update") {
    const row=await db.prepare("SELECT value FROM preferences WHERE user_id=?").bind(user).first<{value:string}>();
    const old=JSON.parse(row?.value || "{}");
    const next={...old,initialized:true};
    for(const key of ["browserAlerts","consent"]) if(typeof body[key]==="boolean") next[key]=body[key];
    for(const [key,min,max] of [["startHour",0,23],["endHour",1,24],["sessionMinutes",15,90]] as const) if(body[key]!=null) next[key]=numberIn(body[key],min,max,min);
    if((next.endHour??21)<=(next.startHour??17))return jsonError("Study end time must be after start time.");
    await db.prepare("INSERT INTO preferences (user_id,value) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value").bind(user,JSON.stringify(next)).run();
  } else if(action==="event:details") {
    if(!await db.prepare("SELECT id FROM events WHERE user_id=? AND id=?").bind(user,id).first())return jsonError("Date not found.",404);
    await db.prepare("UPDATE events SET course_id=?,estimated_minutes=?,grade_group=?,points_possible=?,points_earned=? WHERE id=? AND user_id=?").bind(courseId || null,numberIn(body.estimatedMinutes,15,600,60),cleanText(body.gradeGroup,80),body.pointsPossible==null||body.pointsPossible===""?null:numberIn(body.pointsPossible,0,100000,0),body.pointsEarned==null||body.pointsEarned===""?null:numberIn(body.pointsEarned,0,100000,0),id,user).run();
  } else if(action==="plan:reschedule") {
    const date=cleanText(body.startsAt,80);if(!Number.isFinite(Date.parse(date)) || Date.parse(date)<Date.now()) return jsonError("Choose a future study time.");
    const block=await db.prepare("SELECT minutes FROM study_blocks WHERE id=? AND user_id=?").bind(id,user).first<{minutes:number}>();if(!block)return jsonError("Study block not found.",404);
    const start=new Date(date).toISOString(),end=new Date(Date.parse(date)+block.minutes*60000).toISOString();
    const overlap=await db.prepare("SELECT id FROM study_blocks WHERE user_id=? AND id<>? AND status='planned' AND starts_at<? AND datetime(starts_at,'+' || minutes || ' minutes')>datetime(?)").bind(user,id,end,start).first();
    if(overlap)return jsonError("That time overlaps another study block.");
    await db.prepare("UPDATE study_blocks SET starts_at=?,status='planned' WHERE id=? AND user_id=?").bind(start,id,user).run();
  } else if(action==="focus:save") {
    if(!id)return jsonError("Session ID required.");
    await db.prepare("INSERT OR IGNORE INTO focus_sessions (id,user_id,course_id,minutes,completed_at) VALUES (?,?,?,?,?)").bind(`${user}:${id}`,user,courseId||null,numberIn(body.minutes,1,90,25),now()).run();
  } else if(action==="card:create") {
    const question=cleanText(body.question,1000),answer=cleanText(body.answer,3000);if(!question || !answer)return jsonError("Enter a question and answer.");
    await db.prepare("INSERT INTO flashcards (id,user_id,course_id,question,answer,source,due_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),user,courseId||null,question,answer,cleanText(body.source,300),now()).run();
  } else if(action==="card:review") {
    const card=await db.prepare("SELECT interval_days FROM flashcards WHERE id=? AND user_id=?").bind(id,user).first<{interval_days:number}>();if(!card)return jsonError("Card not found.",404);
    const interval=body.rating==="again"?0:body.rating==="hard"?1:Math.min(180,Math.max(2,card.interval_days*2));
    const due=new Date(Date.now()+(interval?interval*86400000:600000)).toISOString();
    await db.prepare("UPDATE flashcards SET interval_days=?,due_at=?,reviews=reviews+1 WHERE id=? AND user_id=?").bind(interval,due,id,user).run();
  } else if(action==="card:delete") {
    await db.prepare("DELETE FROM flashcards WHERE user_id=? AND id=?").bind(user,id).run();
  } else if(action==="course:delete" || action==="workspace:delete") {
    if(body.confirm!=="DELETE")return jsonError("Type DELETE to confirm removal.");
    const selected=action==="course:delete"?id:"";
    if(action==="course:delete" && !await db.prepare("SELECT id FROM courses WHERE user_id=? AND id=?").bind(user,id).first())return jsonError("Course not found.",404);
    const files=(await db.prepare("SELECT r2_key FROM materials WHERE user_id=? AND (?='' OR course_id=?)").bind(user,selected,selected).all<{r2_key:string}>()).results;
    for(const file of files)if(file.r2_key)await bucket().delete(file.r2_key);
    const statements=["materials","events","study_blocks","flashcards","focus_sessions","grade_history","chat_messages","chat_conversations","material_vectors","course_passages","course_knowledge"].map(table=>db.prepare(`DELETE FROM ${table} WHERE user_id=? AND (?='' OR course_id=?)`).bind(user,selected,selected));
    statements.push(db.prepare("DELETE FROM courses WHERE user_id=? AND (?='' OR id=?)").bind(user,selected,selected));
    if(!selected) for(const table of ["settings","calendar_imports","canvas_connections","extension_sessions","extension_pairings"])statements.push(db.prepare(`DELETE FROM ${table} WHERE user_id=?`).bind(user));
    if(!selected)statements.push(db.prepare("INSERT INTO preferences (user_id,value) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value").bind(user,'{"initialized":true}'));
    else statements.push(db.prepare("INSERT OR IGNORE INTO preferences (user_id,value) VALUES (?,?)").bind(user,'{"initialized":true}'));
    await db.batch(statements);
  } else return false;
  return true;
}
