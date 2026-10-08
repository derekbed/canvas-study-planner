import {chatManagement,ChatError} from '@/lib/chat';
import {extensionError,extensionResponse,extensionUser,fromExtension,preflight} from '@/lib/extension';
export const OPTIONS=preflight;
async function handle(request:Request){if(!fromExtension(request))return extensionError(request,'Unavailable.',403);const user=await extensionUser(request);if(!user)return extensionError(request,'Pair the extension again.',401);try{return extensionResponse(request,await chatManagement(user,request));}catch(e){return extensionError(request,e instanceof ChatError?e.message:'Chat could not be loaded.',e instanceof ChatError?e.status:503);}}
export const GET=handle;export const POST=handle;
