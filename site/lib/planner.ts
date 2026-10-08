import type {Workspace} from './client-types';
import {priorityScore} from './grades';
export function planWeek(data:Workspace,days:number[],hours:number,startHour=17,endHour=21,sessionMinutes=45,now=new Date()) {
 const slots:{start:number;end:number;used:number}[]=[];
 for(let offset=0;offset<7;offset++){
   const date=new Date(now);date.setDate(date.getDate()+offset);if(!days.includes(date.getDay()))continue;
   date.setHours(startHour,0,0,0);const end=new Date(date);end.setHours(endHour,0,0,0);
   const start=Math.max(date.getTime(),Math.ceil(now.getTime()/900000)*900000);
   if(start<end.getTime())slots.push({start,end:end.getTime(),used:0});
 }
 let remaining=Math.round(hours*60);
 const blocks:{courseId:string|null;eventId:string;startsAt:string;minutes:number}[]=[];
 const events=data.events.filter(e=>e.status!=="done"&&Date.parse(e.due_at)>now.getTime()).sort((a,b)=>priorityScore(b,data.courses.find(c=>c.id===b.course_id),now.getTime())-priorityScore(a,data.courses.find(c=>c.id===a.course_id),now.getTime()));
 for(const event of events){
   const done=data.blocks.filter(b=>b.event_id===event.id&&b.status==="done").reduce((n,b)=>n+b.minutes,0);
   let needed=Math.max(0,event.estimated_minutes-done);
   while(needed>=15&&remaining>=15){
     const options=slots.filter(s=>Math.min(s.end,Date.parse(event.due_at))-(s.start+s.used*60000)>=15*60000).sort((a,b)=>a.used-b.used||a.start-b.start);
     if(!options.length)break;
     const slot=options[0],start=slot.start+slot.used*60000;
     const minutes=Math.min(sessionMinutes,needed,remaining,Math.floor((Math.min(slot.end,Date.parse(event.due_at))-start)/60000));
     blocks.push({courseId:event.course_id,eventId:event.id,startsAt:new Date(start).toISOString(),minutes});
     slot.used+=minutes+5;needed-=minutes;remaining-=minutes;
   }
 }
 return blocks.sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
}
