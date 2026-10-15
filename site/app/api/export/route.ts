import { database, jsonError, userId, workspace } from "@/lib/server";
import { exportCalendar } from "@/lib/ics";
export async function GET(request:Request) {
  const user=await userId(request);if(!user)return jsonError("Sign in to export your data.",401);
  try{
    const data=await workspace(user),calendar=new URL(request.url).searchParams.get("format")==="ics";
    if(calendar)return new Response(exportCalendar(data.events),{headers:{"Content-Type":"text/calendar; charset=utf-8","Content-Disposition":'attachment; filename="coursewise.ics"',"Cache-Control":"no-store"}});
    const db=database();
    const materials=(await db.prepare("SELECT id,course_id,name,kind,mime_type,extracted_text,created_at FROM materials WHERE user_id=?").bind(user).all()).results;
    return new Response(JSON.stringify({...data,materials,exportedAt:new Date().toISOString()},null,2),{headers:{"Content-Type":"application/json","Content-Disposition":'attachment; filename="coursewise-data.json"',"Cache-Control":"no-store"}});
  }catch{return jsonError("Export could not be prepared. Please try again.",503);}
}
