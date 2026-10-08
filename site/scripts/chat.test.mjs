import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
const require=createRequire(import.meta.url),ts=require('typescript'),root=path.resolve(import.meta.dirname,'..'),sql=new DatabaseSync(':memory:');
const migrations=fs.readdirSync(path.join(root,'drizzle')).filter(n=>n.endsWith('.sql')).sort();
for(const f of migrations.slice(0,-1))sql.exec(fs.readFileSync(path.join(root,'drizzle',f),'utf8'));
sql.exec("INSERT INTO chat_messages(id,user_id,course_id,role,content,created_at) VALUES ('old-user','legacy','course','user','Hello','2026-01-01'),('old-assistant','legacy','course','assistant','Hi','2026-01-01')");
sql.exec(fs.readFileSync(path.join(root,'drizzle',migrations.at(-1)),'utf8'));
const db={prepare(query){let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:sql.prepare(query).run(...args).changes}};}};},async batch(statements){sql.exec('BEGIN');try{for(const s of statements)await s.run();sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}};
const env={DB:db,OPENAI_API_KEY:'test-key'},modules=new Map();
function load(filename){filename=path.resolve(root,filename);if(!path.extname(filename))filename+='.ts';if(modules.has(filename))return modules.get(filename).exports;const module={exports:{}};modules.set(filename,module);const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new vm.Script(`(function(require,module,exports){${source}\n})`,{filename}).runInThisContext()(name=>name==='cloudflare:workers'?{env}:name.startsWith('@/')?load(name.slice(2)):name.startsWith('.')?load(path.resolve(path.dirname(filename),name)):require(name),module,module.exports);return module.exports;}
const {chatTurn,createConversation,chatManagement}=load('lib/chat'),{rankPassages,cosine}=load('lib/chat-retrieval');
const {selfHarmSupport}=load('lib/study-safety');
const extensionChats=load('app/api/extension/chats/route.ts'),{hashSecret}=load('lib/extension.ts');
for(const user of ['a','b']){sql.prepare('INSERT INTO courses(id,user_id,name,created_at) VALUES (?,?,?,?)').run(user+'-course',user,user+' course','2026-01-01');sql.prepare('INSERT INTO preferences(user_id,value) VALUES (?,?)').run(user,'{"consent":true}');sql.prepare('INSERT INTO materials(id,user_id,course_id,name,extracted_text,created_at) VALUES (?,?,?,?,?,?)').run(user+'-file',user,user+'-course','Syllabus.txt',user==='a'?'The final examination covers motion and momentum. Late work loses ten percent.':'SECRET_OTHER_STUDENT','2026-01-01');}
const payload=(thread,question='What is on the final?')=>({courseId:'a-course',conversationId:thread.id,question,materialIds:['a-file'],requestId:crypto.randomUUID()});
const request=(body)=>new Request('http://localhost/api/chats',{method:'POST',body:JSON.stringify(body)});
let inputs=[],embeddingCalls=0,responseCalls=0,fail=false;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{const data=JSON.parse(options.body);if(url.endsWith('/embeddings')){embeddingCalls++;return Response.json({data:data.input.map((_,i)=>({index:i,embedding:Array.from({length:512},(_,j)=>j===0?1:0)}))});}responseCalls++;if(fail)return new Response('',{status:503});inputs.push(data);return Response.json({output:[{content:[{type:'output_text',text:data.instructions.startsWith('Summarize')?'The student is preparing for the final.':'Review motion and momentum. [Syllabus.txt, section 1]'}]}],usage:{input_tokens:100,output_tokens:20}});};
process.on('exit',()=>globalThis.fetch=originalFetch);
test('migration preserves old messages and orders same-timestamp user before assistant',()=>{const rows=sql.prepare("SELECT role,sequence,conversation_id FROM chat_messages WHERE user_id='legacy' ORDER BY sequence").all();assert.deepEqual(rows.map(r=>r.role),['user','assistant']);assert.ok(rows[0].conversation_id);assert.equal(rows[1].sequence,2);});
test('threads isolate users and courses and reject unauthorised sources',async()=>{const thread=await createConversation('a','a-course');await assert.rejects(()=>chatManagement('b',new Request('http://localhost/api/chats?id='+thread.id)),/not found/);await assert.rejects(()=>chatTurn('b',{...payload(thread),courseId:'b-course',materialIds:[]}),/not found/);await assert.rejects(()=>chatTurn('a',{...payload(thread),materialIds:['b-file']}),/unavailable/);await assert.rejects(()=>chatTurn('a',{...payload(thread),courseId:'',materialIds:[]}),/another course/);});
test('extension can list and reload its own saved chats',async()=>{
  const token='a'.repeat(48),hash=await hashSecret(token);
  sql.prepare('INSERT INTO extension_sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(hash,'a',Date.now()+60_000);
  const thread=await createConversation('a','a-course');await chatTurn('a',payload(thread));
  const headers={Origin:'chrome-extension://fjflmeaiboafcffacfmlaopangaedjho',Authorization:`Bearer ${token}`};
  const listed=await extensionChats.GET(new Request('http://localhost:5173/api/extension/chats?courseId=a-course',{headers}));
  assert.equal(listed.status,200);assert.ok((await listed.json()).conversations.some(item=>item.id===thread.id));
  const loaded=await extensionChats.GET(new Request(`http://localhost:5173/api/extension/chats?id=${thread.id}`,{headers}));
  assert.equal(loaded.status,200);assert.equal((await loaded.json()).messages.length,2);
  const originless=await extensionChats.GET(new Request(`http://localhost:5173/api/extension/chats?id=${thread.id}`,{headers:{Authorization:`Bearer ${token}`}}));
  assert.equal(originless.status,200);assert.equal((await originless.json()).messages.length,2);
  const unpaired=await extensionChats.GET(new Request('http://localhost:5173/api/extension/chats?courseId=a-course'));
  assert.equal(unpaired.status,401);
  const wrongOrigin=await extensionChats.GET(new Request('http://localhost:5173/api/extension/chats?courseId=a-course',{headers:{...headers,Origin:'https://example.com'}}));
  assert.equal(wrongOrigin.status,403);
  sql.prepare('UPDATE extension_sessions SET user_id=? WHERE token_hash=?').run('b',hash);
  const forbidden=await extensionChats.GET(new Request(`http://localhost:5173/api/extension/chats?id=${thread.id}`,{headers}));
  assert.equal(forbidden.status,404);
});
test('follow-ups retain history; retries do not duplicate turns; embeddings are reused',async()=>{const thread=await createConversation('a','a-course');const body=payload(thread);const first=await chatTurn('a',body);assert.equal(first.retrieval,'hybrid');const afterFirst=embeddingCalls,calls=responseCalls;await chatTurn('a',body);assert.equal(responseCalls,calls);await chatTurn('a',payload(thread,'Explain that more simply.'));assert.equal(embeddingCalls,afterFirst+1,'Only the new query should be embedded');const sent=JSON.stringify(inputs.at(-1));assert.match(sent,/What is on the final/);assert.match(sent,/Explain that more simply/);assert.doesNotMatch(sent,/SECRET_OTHER_STUDENT/);assert.equal(inputs.at(-1).store,false);const messages=sql.prepare('SELECT * FROM chat_messages WHERE conversation_id=?').all(thread.id);assert.equal(messages.length,4);assert.ok(messages[1].sources_json.includes('Syllabus'));});
test('long chats use a thread summary and bounded recent history',async()=>{const thread=await createConversation('a','a-course');for(let i=1;i<=24;i++)sql.prepare('INSERT INTO chat_messages(id,user_id,course_id,conversation_id,sequence,role,content,created_at) VALUES (?,?,?,?,?,?,?,?)').run('long-'+i,'a','a-course',thread.id,i,i%2?'user':'assistant',`Turn ${i}: `+'study '.repeat(700),'2026-01-01');await chatTurn('a',payload(thread));const saved=sql.prepare('SELECT summary,summary_through FROM chat_conversations WHERE id=?').get(thread.id);assert.ok(saved.summary);assert.equal(saved.summary_through,18);const sent=JSON.parse(inputs.at(-1).input);assert.ok(sent.recentConversation.reduce((n,m)=>n+m.content.length,0)<=10000);assert.ok(sent.summary.length<=2000);const other=await createConversation('a','a-course');await chatTurn('a',payload(other));assert.equal(JSON.parse(inputs.at(-1).input).summary,'');});
test('failed generation stores no partial pair and releases its lock',async()=>{const thread=await createConversation('a','a-course');fail=true;try{await assert.rejects(()=>chatTurn('a',payload(thread)),/could not answer/);}finally{fail=false;}assert.equal(sql.prepare('SELECT count(*) n FROM chat_messages WHERE conversation_id=?').get(thread.id).n,0);assert.equal(sql.prepare('SELECT lease_until FROM chat_conversations WHERE id=?').get(thread.id).lease_until,0);});
test('explicit self-harm messages receive human-help guidance without reaching OpenAI',async()=>{
  assert.equal(selfHarmSupport('Explain how the novel portrays suicide'),null);
  assert.match(selfHarmSupport('I want to kill myself')||'',/988/);
  const thread=await createConversation('a','a-course'),before=responseCalls;
  sql.prepare('UPDATE preferences SET value=? WHERE user_id=?').run('{"consent":false}','a');
  const key=env.OPENAI_API_KEY;delete env.OPENAI_API_KEY;
  try{
    const reply=await chatTurn('a',payload(thread,'I want to kill myself'));
    assert.match(reply.answer,/trained crisis counselor/);
    assert.equal(reply.retrieval,'safety');
    assert.equal(responseCalls,before);
    assert.equal(sql.prepare('SELECT count(*) n FROM chat_messages WHERE conversation_id=?').get(thread.id).n,2);
  }finally{env.OPENAI_API_KEY=key;sql.prepare('UPDATE preferences SET value=? WHERE user_id=?').run('{"consent":true}','a');}
});
test('active turns reject concurrent sends and deletion; deletion removes the transcript',async()=>{const thread=await createConversation('a','a-course');await chatTurn('a',payload(thread));sql.prepare('UPDATE chat_conversations SET lease_until=? WHERE id=?').run(Date.now()+100000,thread.id);await assert.rejects(()=>chatTurn('a',payload(thread)),/already/);await assert.rejects(()=>chatManagement('a',request({action:'delete',id:thread.id})),/Wait/);sql.prepare('UPDATE chat_conversations SET lease_until=0 WHERE id=?').run(thread.id);await chatManagement('a',request({action:'delete',id:thread.id}));assert.equal(sql.prepare('SELECT count(*) n FROM chat_messages WHERE conversation_id=?').get(thread.id).n,0);});
test('retrieval combines semantic matches and terms while respecting evidence size',()=>{assert.equal(cosine([1,0],[1,0]),1);assert.equal(cosine([1],[1,0]),0);const passages=Array.from({length:20},(_,i)=>({id:String(i),material_id:'m',source_label:'page '+i,text:(i===5?'late policy':'motion')+'x'.repeat(900)}));const hits=rankPassages(passages,'late policy',passages.map((_,i)=>i===5?.9:0));assert.equal(hits[0].id,'5');assert.ok(hits.length<=6);assert.ok(hits.reduce((n,p)=>n+p.text.length,0)<=6000);});
