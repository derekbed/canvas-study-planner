import {chatTurn,ChatError} from '@/lib/chat';
import {userId,jsonError} from '@/lib/server';
export async function POST(request:Request){
 const user=userId(request);if(!user)return jsonError('Sign in first.',401);
 try{const raw=await request.text();if(new TextEncoder().encode(raw).length>12000)return jsonError('Question is too large.',413);
 const body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))return jsonError('Invalid request.');
 // Canvas page context is accepted only through the separately validated extension endpoint.
 delete body.canvasContext;delete body.canvasSnapshot;
 return Response.json(await chatTurn(user,body),{headers:{'Cache-Control':'no-store'}});
 }catch(e){return jsonError(e instanceof ChatError?e.message:e instanceof SyntaxError?'Invalid request.':'Chat is unavailable.',e instanceof ChatError?e.status:e instanceof SyntaxError?400:503);}
}
