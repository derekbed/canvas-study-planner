import {chatManagement,ChatError} from '@/lib/chat';
import {userId,jsonError} from '@/lib/server';
async function handle(request:Request){const user=await userId(request);if(!user)return jsonError('Sign in first.',401);try{return Response.json(await chatManagement(user,request),{headers:{'Cache-Control':'no-store'}});}catch(e){return jsonError(e instanceof ChatError?e.message:'Chat could not be loaded.',e instanceof ChatError?e.status:503);}}
export const GET=handle;export const POST=handle;
