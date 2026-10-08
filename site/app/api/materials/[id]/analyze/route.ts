import { database,jsonError,userId,type Material } from "@/lib/server";
import { syllabusCandidates } from "@/lib/material-context";
export async function GET(request:Request, context:{params:Promise<{id:string}>}) {
  const user=await userId(request);if(!user)return jsonError("Sign in first.",401);
  const {id}=await context.params;
  const material=await database().prepare("SELECT * FROM materials WHERE id=? AND user_id=?").bind(id,user).first<Material>();
  if(!material)return jsonError("File not found.",404);
  return Response.json({candidates:syllabusCandidates(material),note:"These are possible dates, grading rules, and requirements found in the text. Verify against the source; dates without a year need your confirmation."});
}
