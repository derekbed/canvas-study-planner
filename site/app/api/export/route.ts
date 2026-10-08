import { database, jsonError, userId, workspace } from "@/lib/server";
import { exportCalendar } from "@/lib/ics";
export async function GET(request:Request) {
  const user=await userId(request);if(!user)return jsonError("Sign in to export your data.",401);
  try{
    const data=await workspace(user),calendar=new URL(request.url).searchParams.get("format")==="ics";
    if(calendar)return new Response(exportCalendar(data.events),{headers:{"Content-Type":"text/calendar; charset=utf-8","Content-Disposition":'attachment; filename="coursewise.ics"',"Cache-Control":"no-store"}});
    const db=database();
    const materials=(await db.prepare("SELECT id,course_id,name,kind,mime_type,extracted_text,created_at FROM materials WHERE user_id=?").bind(user).all()).results;
    const messages=(await db.prepare("SELECT conversation_id,sequence,course_id,role,content,sources_json,created_at FROM chat_messages WHERE user_id=?").bind(user).all()).results;
    const conversations=(await db.prepare("SELECT id,course_id,title,summary,created_at,updated_at FROM chat_conversations WHERE user_id=?").bind(user).all()).results;
    const knowledge=(await db.prepare("SELECT course_id,brief,facts_json,gaps_json,memory_summary,status,source_material_id,updated_at FROM course_knowledge WHERE user_id=?").bind(user).all()).results;
    return new Response(JSON.stringify({...data,materials,messages,conversations,knowledge,exportedAt:new Date().toISOString()},null,2),{headers:{"Content-Type":"application/json","Content-Disposition":'attachment; filename="coursewise-data.json"',"Cache-Control":"no-store"}});
  }catch{return jsonError("Export could not be prepared. Please try again.",503);}
}
