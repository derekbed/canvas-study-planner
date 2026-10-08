"use client";
import {useEffect,useRef,useState} from 'react';
import {MessageCircle,Plus,Send,Sparkles,Trash2,ChevronDown,BookOpen} from 'lucide-react';
import {toast} from 'sonner';
import '../../../extension/chat-format.js';
import type {Workspace} from '@/lib/client-types';
type Message={id:string;role:string;content:string;sequence?:number;sources?:string[]};
type Thread={id:string;title:string;updated_at:string};
async function api(url:string,body?:unknown){const r=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);const d=await r.json() as {error?:string;conversations:Thread[];conversation:Thread;messages:Message[];hasMore:boolean;answer:string;sources:string[];retrieval?:string};if(!r.ok)throw new Error(d.error||'Chat is unavailable.');return d;}
function MessageText({text,formatted}:{text:string;formatted:boolean}){
  if(!formatted)return <div className="cw-message-text cw-plain-message">{text}</div>;
  const inlines=(nodes:CoursewiseInline[])=>nodes.map((node,i)=>{
    const content=node.children?inlines(node.children):node.text?.split('\n').flatMap((part,j)=>j?[<br key={`${i}-${j}-br`}/>,part]:[part]);
    if(node.type==='strong')return <strong key={i}>{content}</strong>;
    if(node.type==='em')return <em key={i}>{content}</em>;
    if(node.type==='strike')return <s key={i}>{content}</s>;
    if(node.type==='code')return <code key={i}>{content}</code>;
    if(node.type==='link')return <a key={i} href={node.href} target="_blank" rel="noopener noreferrer">{content}</a>;
    return <span key={i}>{content}</span>;
  });
  const blocks=(items:CoursewiseBlock[])=>items.map((block,i)=>{
    if(block.type==='heading')return <h3 key={i}>{inlines(block.children||[])}</h3>;
    if(block.type==='code')return <pre key={i}><code>{block.text}</code></pre>;
    if(block.type==='rule')return <hr key={i}/>;
    if(block.type==='quote')return <blockquote key={i}>{blocks(block.blocks||[])}</blockquote>;
    if(block.type==='list'){
      const content=block.items?.map((item,j)=><li key={j}>{inlines(item.children)}{blocks(item.blocks)}</li>);
      return block.ordered?<ol key={i} start={block.start}>{content}</ol>:<ul key={i}>{content}</ul>;
    }
    return <p key={i}>{inlines(block.children||[])}</p>;
  });
  return <div className="cw-message-text cw-formatted-message">{blocks(CoursewiseChatFormat.parse(text))}</div>;
}
export default function ChatView({data,onRefresh}:{data:Workspace;onRefresh:()=>Promise<void>}){
  const [courseId,setCourseId]=useState(data.courses[0]?.id||'');
  const [threads,setThreads]=useState<Thread[]>([]),[threadId,setThreadId]=useState('');
  const [messages,setMessages]=useState<Message[]>([]),[question,setQuestion]=useState('');
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[hasMore,setHasMore]=useState(false);
  const [selected,setSelected]=useState<string[]|null>(null),[error,setError]=useState('');
  const bottom=useRef<HTMLDivElement>(null),generation=useRef(0),retry=useRef<{text:string;id:string}|null>(null);
  const materials=data.materials.filter(m=>!courseId||m.course_id===courseId),sourceIds=selected??materials.filter(m=>m.preview).map(m=>m.id);
  const course=data.courses.find(c=>c.id===courseId),thread=threads.find(t=>t.id===threadId);
  async function load(id:string,older=false){const gen=++generation.current;setLoading(true);setError('');try{const d=await api(`/api/chats?id=${encodeURIComponent(id)}${older?`&before=${messages[0]?.sequence}`:''}`);if(gen!==generation.current)return;setThreadId(id);setMessages(old=>older?[...d.messages,...old]:d.messages);setHasMore(d.hasMore);}catch(e){if(gen===generation.current)setError((e as Error).message);}finally{if(gen===generation.current)setLoading(false);}}
  useEffect(()=>{const gen=++generation.current;setLoading(true);setSelected(null);setMessages([]);setThreadId('');setQuestion('');setError('');retry.current=null;
    api(`/api/chats?courseId=${encodeURIComponent(courseId)}`).then(async d=>{if(gen!==generation.current)return;setThreads(d.conversations);if(d.conversations[0])await load(d.conversations[0].id);else setLoading(false);}).catch(e=>{if(gen===generation.current){setError(e.message);setLoading(false);}});
    return()=>{generation.current++;};
  },[courseId]); // Course changes invalidate pending history requests.
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth',block:'nearest'});},[messages.length,busy]);
  function fresh(){generation.current++;setLoading(false);setThreadId('');setMessages([]);setHasMore(false);setQuestion('');setError('');retry.current=null;}
  async function retryHistory(){try{setError('');const list=await api(`/api/chats?courseId=${encodeURIComponent(courseId)}`);setThreads(list.conversations);if(list.conversations.length)await load(threadId||list.conversations[0].id);}catch(e){setError((e as Error).message);}}
  async function remove(){if(!threadId)return;try{await api('/api/chats',{action:'delete',id:threadId});setThreads(old=>old.filter(t=>t.id!==threadId));fresh();}catch(e){toast.error((e as Error).message);}}
  async function rename(){const title=window.prompt('Conversation name',thread?.title);if(!title?.trim())return;try{await api('/api/chats',{action:'rename',id:threadId,title});setThreads(old=>old.map(t=>t.id===threadId?{...t,title:title.trim()}:t));}catch(e){toast.error((e as Error).message);}}
  async function ask(text=question,mode='chat'){
    text=text.trim();if(!text||busy||loading)return;setBusy(true);setError('');
    const draft={id:crypto.randomUUID(),role:'user',content:text};setMessages(old=>[...old,draft]);setQuestion('');
    try{
      let id=threadId;
      if(!id){const created=await api('/api/chats',{action:'create',courseId});id=created.conversation.id;setThreadId(id);setThreads(old=>[created.conversation,...old]);}
      const requestId=retry.current?.text===text?retry.current.id:crypto.randomUUID();retry.current={text,id:requestId};
      const result=await api('/api/study',{courseId,conversationId:id,requestId,question:text,mode,materialIds:sourceIds});
      // The answer is already saved. Show it now; a failed history refresh must
      // not erase a successful turn or put its question back in the composer.
      setMessages(old=>[...old,{id:crypto.randomUUID(),role:'assistant',content:result.answer,sources:result.sources}]);
      retry.current=null;
      await load(id);
      try{const list=await api(`/api/chats?courseId=${encodeURIComponent(courseId)}`);setThreads(list.conversations);}catch{setError('Your reply is saved. Retry loading chats to refresh the list.');}
      if(mode==='flashcards')await onRefresh().catch(()=>{});
      if(result.retrieval==='keyword-fallback')toast('Semantic search is temporarily unavailable; this reply used keyword retrieval.');
    }catch(e){setMessages(old=>old.filter(m=>m.id!==draft.id));setQuestion(text);setError((e as Error).message);}finally{setBusy(false);}
  }
  return <div className="conversation-workspace">
    <aside className="conversation-sidebar"><div className="conversation-brand"><Sparkles size={19}/><strong>Coursewise AI</strong></div>
      <label className="conversation-course">COURSE<select value={courseId} disabled={busy||loading} onChange={e=>setCourseId(e.target.value)}><option value="">All courses</option>{data.courses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <button className="conversation-new" onClick={fresh} disabled={busy}><Plus size={17}/> New conversation</button><p className="eyebrow">RECENT CHATS</p>
      <nav aria-label="Saved conversations" className="conversation-list">{threads.map(t=><button key={t.id} disabled={busy||loading} className={t.id===threadId?'active':''} onClick={()=>load(t.id)}><MessageCircle size={15}/><span>{t.title}</span></button>)}{!threads.length&&!error&&<small>Your conversations will appear here.</small>}{error&&<button disabled={busy||loading} onClick={retryHistory}>Retry loading chats</button>}</nav>
      <div className="conversation-footnote"><BookOpen size={16}/><span>Grounded in your courses.<br/>Saved for your next visit.</span></div></aside>
    <section className="conversation-main"><header className="conversation-header"><div><p className="eyebrow">{course?.name||'YOUR WORKSPACE'}</p><h2>{thread?.title||'A little clarity for your coursework'}</h2></div>{threadId&&<div className="conversation-actions"><button onClick={rename} disabled={busy||loading}>Rename</button><button onClick={remove} disabled={busy||loading} aria-label="Delete conversation"><Trash2 size={17}/></button></div>}</header>
      <div className="conversation-transcript" aria-label="Conversation" aria-busy={busy||loading}>{hasMore&&<button disabled={loading||busy} onClick={()=>load(threadId,true)}>Load earlier messages</button>}{!messages.length&&!loading&&<div className="conversation-welcome"><span><Sparkles size={27}/></span><h3>Where should we start?</h3><p>Ask a question. Work through it together.<br/>Pick up right where you left off.</p><div className="conversation-starters">{['What should I focus on this week?','Help me prepare for my next exam.','Explain the grading and late-work policies.'].map(q=><button key={q} disabled={busy} onClick={()=>ask(q)}>{q}<span>↗</span></button>)}</div></div>}
      {messages.map(m=><article key={m.id} className={`conversation-message ${m.role}`}><small>{m.role==='user'?'YOU':'COURSEWISE'}</small><MessageText text={m.content} formatted={m.role!=='user'}/>{!!m.sources?.length&&<details className="conversation-sources"><summary>{m.sources.length} sources supplied <ChevronDown size={12}/></summary><ul>{m.sources.map((s,i)=><li key={i}>{s}</li>)}</ul></details>}</article>)}{(busy||loading)&&<p className="conversation-thinking" role="status"><Sparkles size={16}/>{busy?'Working with your course context…':'Loading conversation…'}</p>}<div ref={bottom}/></div>
      <div className="conversation-compose-area">{error&&<p role="alert" className="conversation-error">{error}</p>}<details className="conversation-context"><summary><BookOpen size={14}/>{sourceIds.length} course files selected <ChevronDown size={13}/></summary><div>{materials.map(m=><label key={m.id}><input type="checkbox" disabled={busy||!m.preview} checked={sourceIds.includes(m.id)} onChange={e=>setSelected(e.target.checked?[...sourceIds,m.id]:sourceIds.filter(id=>id!==m.id))}/>{m.name}</label>)}{!materials.length&&<p>Upload a syllabus or notes to add document context.</p>}<small>Removing a file excludes it from new retrieval. Earlier messages may still discuss it; start a new chat for a clean context.</small></div></details>
      <form className="conversation-composer" onSubmit={e=>{e.preventDefault();ask();}}><textarea aria-label="Message Coursewise" rows={2} maxLength={2000} value={question} disabled={busy||loading} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();ask();}}} placeholder={messages.length?'Ask a follow-up…':'Ask about your course…'}/><button aria-label="Send message" disabled={busy||loading||!question.trim()||!data.aiAvailable}><Send size={19}/></button></form><p className="conversation-caption">Coursewise is an AI study tool, not a person or crisis service. Enter to send · Shift + Enter for a new line · AI can make mistakes; check cited sources.</p>
      <details className="conversation-tools"><summary>Study tools</summary><div>{[['flashcards','Flashcards'],['quiz','Practice quiz'],['guide','Study guide'],['exam','Mock exam']].map(([mode,label])=><button key={mode} disabled={busy||loading||!sourceIds.length} onClick={()=>ask(`Create a ${label.toLowerCase()} for ${course?.name||'my courses'}.`,mode)}>{label}</button>)}</div></details></div>
    </section></div>;
}
