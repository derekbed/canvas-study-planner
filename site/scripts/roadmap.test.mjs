import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const require=createRequire(import.meta.url),ts=require('typescript');
const root=path.resolve(import.meta.dirname,'..');
const sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
const db={prepare(query){let args=[];return{bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return{results:sql.prepare(query).all(...args)};},async run(){return sql.prepare(query).run(...args);}};},async batch(statements){sql.exec('BEGIN');try{const values=[];for(const statement of statements)values.push(await statement.run());sql.exec('COMMIT');return values;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const objects=new Map(),env={DB:db,BUCKET:{async delete(key){objects.delete(key);},async get(key){return objects.get(key)||null;},async put(key,value){objects.set(key,value);}}};
const modules=new Map();
function load(filename){filename=path.resolve(root,filename);if(!path.extname(filename))filename+='.ts';if(modules.has(filename))return modules.get(filename).exports;const module={exports:{}};modules.set(filename,module);const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new vm.Script(`(function(require,module,exports){${code}\n})`,{filename}).runInThisContext()((name)=>name==='cloudflare:workers'?{env}:name.startsWith('@/')?load(name.slice(2)):name.startsWith('.')?load(path.resolve(path.dirname(filename),name)):require(name),module,module.exports);return module.exports;}
const api=load('app/api/workspace/route.ts'),imports=load('app/api/calendar/import/route.ts'),ics=load('lib/ics.ts'),grades=load('lib/grades.ts'),planner=load('lib/planner.ts');
const req=(data,user='student-a',url='/api/workspace')=>new Request('https://test.example'+url,{method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':user},body:JSON.stringify(data)});
async function mutate(action,data={},user='student-a'){const response=await api.POST(req({action,...data},user));const result=await response.json();assert.equal(response.status,200,result.error);return result;}
const calendar=(events)=>`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.join('\r\n')}\r\nEND:VCALENDAR`;
const event=(uid,title='Essay [ENG 101]',date='20261009T230000Z',extra='')=>`BEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${title}\r\nDTSTART:${date}\r\n${extra}\r\nEND:VEVENT`;
async function importFeed(text,user='student-a'){return imports.POST(req({icsText:text},user));}

test('calendar import reconciles safely, preserves manual data and completion, and isolates students',async()=>{
 let data=await mutate('course:create',{name:'English',code:'ENG 101'});const course=data.courses.find(c=>c.code==='ENG 101');
 data=await mutate('event:create',{title:'Manual date',courseId:course.id,dueAt:'2026-10-12T12:00:00Z'});const manual=data.events.find(e=>e.title==='Manual date');
 let result=await (await importFeed(calendar([event('a'),event('b')]))).json();assert.deepEqual(result.summary,{added:2,updated:0,removed:0,unchanged:0});
 const imported=result.events.find(e=>e.canvas_id==='ics:a');assert.equal(imported.course_id,course.id);
 await mutate('event:update',{id:imported.id,status:'done',pointsEarned:8});
 result=await(await importFeed(calendar([event('a'),event('b')]))).json();assert.equal(result.summary.unchanged,2);assert.equal(result.events.find(e=>e.id===imported.id).status,'done');
 result=await(await importFeed(calendar([event('a','Changed','20261010T230000Z'),event('b','Cancelled','20261009T230000Z','STATUS:CANCELLED')]))).json();assert.equal(result.summary.updated,1);assert.equal(result.summary.removed,1);assert.ok(result.events.some(e=>e.id===manual.id));assert.equal(result.events.find(e=>e.id===imported.id).points_earned,8);
 const failed=await importFeed('BEGIN:VCALENDAR\nBEGIN:VEVENT');assert.equal(failed.status,400);assert.equal(sql.prepare("SELECT count(*) AS n FROM events WHERE user_id='student-a' AND source='ics'").get().n,1);
 await importFeed(calendar([event('a','Other student')] ),'student-b');assert.equal(sql.prepare("SELECT title FROM events WHERE user_id='student-a' AND source='ics'").get().title,'Changed');
 result=await(await importFeed(calendar([]))).json();assert.equal(result.summary.removed,1);assert.ok(result.events.some(e=>e.id===manual.id));
});
test('calendar parsing respects time zones, rejects partial/invalid feeds, and filters unsafe links',()=>{
 const parsed=ics.parseIcsCalendar(calendar([event('tz','Lecture','20261004T090000').replace('DTSTART:','DTSTART;TZID=America/New_York:')]));assert.equal(parsed[0].startsAt,'2026-10-04T13:00:00.000Z');
 assert.throws(()=>ics.parseIcsCalendar(calendar([event('bad','Invalid','20260230T090000Z')])));
 assert.throws(()=>ics.parseIcsCalendar(calendar([event('rec','Recurring','20261004T090000Z','RRULE:FREQ=DAILY')])));
 assert.equal(ics.safePublicUrl('javascript:alert(1)'),null);assert.equal(ics.safePublicUrl('https://canvas.example/feeds/calendars/secret.ics'),null);
 const exported=ics.exportCalendar([{id:'1',title:'A, B; C\nD',description:'Study',due_at:'2026-10-04T12:00:00Z',status:'upcoming'}]);assert.match(exported,/SUMMARY:A\\, B\\; C\\nD/);assert.equal(ics.parseIcsCalendar(exported)[0].title,'A, B; C\nD');
});
test('weighted estimates disclose missing categories and correctly solve a target',()=>{
 const c={id:'c',target_grade:90,current_grade:80,grade_weights:'{"Homework":40,"Exam":60}'};
 const base={course_id:'c',status:'upcoming',title:'Work',due_at:'2026-10-10',estimated_minutes:60};
 const entries=[{...base,id:'a',grade_group:'Homework',points_possible:100,points_earned:100},{...base,id:'b',grade_group:'Exam',points_possible:100,points_earned:null}];
 assert.equal(grades.projectGrade(c,entries).needed,83.4);assert.equal(grades.projectGrade(c,entries.slice(0,1)).projected,null);assert.equal(grades.projectGrade(c,entries,{b:90}).projected,94);
});
test('study plans respect availability, breaks, deadlines and completed effort',()=>{
 const now=new Date('2026-10-05T12:00:00Z');const due=new Date(now);due.setHours(20,0,0,0);
 const data={courses:[],events:[{id:'e',course_id:null,title:'Essay',due_at:due.toISOString(),status:'upcoming',estimated_minutes:150,points_possible:10}],blocks:[]};
 const blocks=planner.planWeek(data,[now.getDay()],3,17,19,45,now);assert.equal(blocks.length,3);assert.equal(blocks.reduce((n,b)=>n+b.minutes,0),110);
 for(const b of blocks){const start=new Date(b.startsAt);assert.ok(start.getHours()>=17);assert.ok(start.getTime()+b.minutes*60000<=due.getTime());assert.ok(start.getTime()+b.minutes*60000<=new Date(now).setHours(19,0,0,0));}
 assert.ok(Date.parse(blocks[1].startsAt)>=Date.parse(blocks[0].startsAt)+(blocks[0].minutes+5)*60000);
 assert.equal(planner.planWeek({...data,blocks:[{event_id:'e',status:'done',minutes:150}]},[now.getDay()],3,17,19,45,now).length,0);
});
test('saved reviews, focus sessions, preferences and deletion are account-scoped',async()=>{
 let data=await mutate('card:create',{question:'Recall?',answer:'Answer'});const card=data.cards.at(-1);
 data=await mutate('card:review',{id:card.id,rating:'good'});assert.equal(data.cards.find(c=>c.id===card.id).interval_days,2);
 const forbidden=await api.POST(req({action:'card:review',id:card.id,rating:'again'},'student-b'));assert.equal(forbidden.status,404);
 await mutate('focus:save',{id:'one-session',minutes:25});data=await mutate('focus:save',{id:'one-session',minutes:25});assert.equal(data.focusSessions.length,1);
 data=await mutate('preferences:update',{browserAlerts:true,consent:true,startHour:16,endHour:20});assert.equal(data.preferences.consent,true);
 const bad=await api.POST(req({action:'preferences:update',startHour:21,endHour:20}));assert.equal(bad.status,400);
 await mutate('workspace:delete',{confirm:'DELETE'});data=await(await api.GET(new Request('https://test.example/api/workspace',{headers:{'oai-authenticated-user-id':'student-a'}}))).json();assert.equal(data.courses.length,0);assert.equal(data.cards.length,0);assert.equal(data.focusSessions.length,0);assert.equal(data.preferences.consent,undefined);
 assert.ok(sql.prepare("SELECT count(*) AS n FROM events WHERE user_id='student-b'").get().n>0);
});
test('material retrieval and extraction retain actual page labels',()=>{
 const m=load('lib/material-context.ts');const material={id:'m',name:'Syllabus.pdf',extracted_text:'[Page 1]\nHomework 40%.\n[Page 2]\nFinal exam 2026-12-10. No late exams.'};
 assert.ok(m.syllabusCandidates(material).some(c=>c.date==='2026-12-10'&&c.source==='Syllabus.pdf, page 2'));
 assert.ok(m.relevantPassages([material],'final exam')[0].label.includes('page 2'));
});

test('course deletion does not reseed samples, and student score edits persist',async()=>{
 let data=await mutate('course:create',{name:'Only course'},'student-c');const course=data.courses[0];
 data=await mutate('event:create',{courseId:course.id,title:'Exam',dueAt:'2026-12-01T12:00:00Z'},'student-c');const event=data.events[0];
 data=await mutate('event:details',{id:event.id,courseId:course.id,estimatedMinutes:75,gradeGroup:'Exams',pointsPossible:100,pointsEarned:88},'student-c');assert.equal(data.events[0].points_earned,88);
 data=await mutate('course:delete',{id:course.id,confirm:'DELETE'},'student-c');assert.equal(data.courses.length,0);assert.equal(data.events.length,0);
});
test('material access and AI consent are checked before private excerpts leave the account',async()=>{
 const materialApi=load('app/api/materials/[id]/route.ts'),analyze=load('app/api/materials/[id]/analyze/route.ts'),study=load('app/api/study/route.ts');
 sql.prepare("INSERT INTO materials (id,user_id,course_id,name,kind,mime_type,r2_key,extracted_text,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run('private-file','owner','course','Private.pdf','notes','application/pdf','private-key','Private content','2026-10-01');
 const request=new Request('https://test.example/api/materials/private-file',{headers:{'oai-authenticated-user-id':'stranger'}}),context={params:Promise.resolve({id:'private-file'})};
 assert.equal((await materialApi.GET(request,context)).status,404);assert.equal((await materialApi.DELETE(request,context)).status,404);assert.equal((await analyze.GET(request,context)).status,404);
 env.OPENAI_API_KEY='test-only';let sent=false;const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{sent=true;throw new Error('Must not send');};
 try {assert.equal((await study.POST(req({question:'Summarize my notes'},'owner'))).status,403);assert.equal(sent,false);}finally{globalThis.fetch=oldFetch;delete env.OPENAI_API_KEY;}
});
test('failed calendar transactions roll back without logging the private feed URL',async()=>{
 const originalBatch=db.batch,originalFetch=globalThis.fetch,originalLog=console.error;
 let logs=[];console.error=(...values)=>logs.push(values.join(' '));
 globalThis.fetch=async()=>{throw new Error('Network error https://school.example/feeds/calendars/secret.ics');};
 try{
   let response=await imports.POST(req({feedUrl:'https://school.example/feeds/calendars/secret.ics'}));assert.equal(response.status,503);assert.ok(!(await response.text()).includes('secret'));assert.equal(logs.length,0);
   db.batch=async statements=>{sql.exec('BEGIN');try{await statements[0].run();throw new Error('Injected failure');}finally{sql.exec('ROLLBACK');}};
   const before=sql.prepare("SELECT count(*) AS n FROM events WHERE user_id='student-b'").get().n;
   response=await importFeed(calendar([event('must-rollback')]),'student-b');assert.equal(response.status,503);assert.equal(sql.prepare("SELECT count(*) AS n FROM events WHERE user_id='student-b'").get().n,before);
   assert.equal(sql.prepare("SELECT id FROM events WHERE canvas_id='ics:must-rollback'").get(),undefined);
 }finally{db.batch=originalBatch;globalThis.fetch=originalFetch;console.error=originalLog;}
});
test('Canvas sync keeps identical school course IDs isolated per student',async()=>{
 const canvas=load('lib/canvas.ts');env.TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
 const encrypted=await canvas.encrypt('test-only-token');for(const user of ['canvas-a','canvas-b'])sql.prepare('INSERT INTO canvas_connections (user_id,base_url,access_token,refresh_token) VALUES (?,?,?,?)').run(user,'https://school.instructure.com',encrypted,encrypted);
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async url=>{const p=new URL(url).pathname;if(p.endsWith('/courses'))return Response.json([{id:1,name:'Biology',course_code:'BIO',enrollments:[{grades:{current_score:91}}]}]);if(p.endsWith('/assignment_groups'))return Response.json([{id:7,name:'Homework',group_weight:100}]);if(p.endsWith('/assignments'))return Response.json([{id:9,name:'Lab report',description:'Write your findings.',due_at:'2026-10-10T12:00:00Z',html_url:'https://school.instructure.com/courses/1/assignments/9',points_possible:100,assignment_group_id:7}]);return Response.json([{id:9,title:'Office hours',start_at:'2026-10-09T12:00:00Z',context_code:'course_1'}]);};
 try{await canvas.syncCanvas('canvas-a');await canvas.syncCanvas('canvas-b');await canvas.syncCanvas('canvas-a');const a=sql.prepare("SELECT * FROM courses WHERE user_id='canvas-a'").get(),b=sql.prepare("SELECT * FROM courses WHERE user_id='canvas-b'").get();assert.notEqual(a.id,b.id);assert.equal(a.current_grade,91);assert.equal(sql.prepare("SELECT count(*) AS n FROM events WHERE user_id='canvas-a'").get().n,2);assert.equal(sql.prepare("SELECT description FROM events WHERE user_id='canvas-a' AND kind='assignment'").get().description,'Write your findings.');assert.equal(sql.prepare("SELECT course_id FROM events WHERE user_id='canvas-b' AND kind='event'").get().course_id,b.id);}finally{globalThis.fetch=oldFetch;delete env.TOKEN_ENCRYPTION_KEY;}
});
test('AI flashcards use selected excerpts, validate source labels, and save to review',async()=>{
 const study=load('app/api/study/route.ts');await mutate('preferences:update',{consent:true},'ai-student');
 sql.prepare('INSERT INTO materials (id,user_id,course_id,name,kind,mime_type,extracted_text,created_at) VALUES (?,?,?,?,?,?,?,?)').run('selected','ai-student','notes','Notes.pdf','notes','application/pdf','[Page 2]\nMitosis produces two daughter cells.','2026-10-01');
 sql.prepare('INSERT INTO materials (id,user_id,course_id,name,kind,mime_type,extracted_text,created_at) VALUES (?,?,?,?,?,?,?,?)').run('unselected','ai-student','notes','Private.pdf','notes','application/pdf','DO_NOT_SEND_UNSELECTED_TEXT','2026-10-01');
 const oldFetch=globalThis.fetch;env.OPENAI_API_KEY='test-only';let requestBody;
 globalThis.fetch=async(url,options)=>{requestBody=JSON.parse(options.body);return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({cards:[{question:'What does mitosis produce?',answer:'Two daughter cells.',source:'Notes.pdf, page 2'}]})}]}]});};
 try{const response=await study.POST(req({mode:'flashcards',question:'Review mitosis',materialIds:['selected']},'ai-student'));assert.equal(response.status,200);assert.ok(requestBody.input.includes('Mitosis'));assert.ok(!requestBody.input.includes('DO_NOT_SEND_UNSELECTED_TEXT'));assert.equal(requestBody.store,false);assert.equal(sql.prepare("SELECT source FROM flashcards WHERE user_id='ai-student'").get().source,'Notes.pdf, page 2');}finally{globalThis.fetch=oldFetch;delete env.OPENAI_API_KEY;}
});
