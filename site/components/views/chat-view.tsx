"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, Layers3, MessageCircle, Send, Sparkles, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Workspace } from "@/lib/client-types";

type Message = { id: string; role: string; content: string };
export default function ChatView({ data }: { data: Workspace }) {
  const [courseId, setCourseId] = useState(data.courses[0]?.id || "");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const course = data.courses.find(c => c.id === courseId);
  const materials = data.materials.filter(m => m.course_id === courseId);
  useEffect(() => {
    let active = true;
    fetch(`/api/study?courseId=${encodeURIComponent(courseId)}`).then(r => r.json() as Promise<{ messages?: Message[] }>).then(result => { if (active) setMessages(result.messages || []); }).catch(() => { if (active) setMessages([]); });
    return () => { active = false; };
  }, [courseId]);
  const ask = async (mode: "chat" | "flashcards" | "quiz", prompt?: string) => {
    const text = (prompt || question).trim(); if (!text) return;
    if (!data.aiAvailable) return toast.error("Add an OpenAI API key to activate study chat.");
    if (mode !== "chat" && !materials.some(m => m.preview)) return toast.error("Upload a readable course file first.");
    setBusy(true);
    const draft: Message = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages(previous => [...previous, draft]); setQuestion("");
    try {
      const response = await fetch("/api/study", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, question: text, mode }) });
      const result = await response.json() as { error?: string; answer?: string };
      if (!response.ok) throw new Error(result.error || "Study chat could not answer.");
      setMessages(previous => [...previous, { id: crypto.randomUUID(), role: "assistant", content: result.answer || "" }]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Study chat could not answer."); }
    finally { setBusy(false); }
  };
  const query = encodeURIComponent(course?.name || "study skills");
  return <div className="chat-layout"><section className="content-panel chat-main"><div className="panel-title"><div><p className="eyebrow">STUDY ASSISTANT</p><h2>Ask about your course</h2></div><NativeSelect value={courseId} onChange={event => setCourseId(event.target.value)} aria-label="Choose chat course"><NativeSelectOption value="">All courses</NativeSelectOption>{data.courses.map(c => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}</NativeSelect></div><div className="chat-messages">{messages.length ? messages.map(m => <div className={`chat-message ${m.role}`} key={m.id}>{m.role === "assistant" && <span className="assistant-avatar"><Sparkles size={15} /></span>}<p>{m.content}</p></div>) : <div className="chat-welcome"><span><MessageCircle size={24} /></span><h3>What do you want to work on?</h3><p>Ask which assignment to prioritize, how to prepare for a test, or what your target grade requires.</p></div>}{busy && <div className="chat-thinking"><Sparkles size={17} /> Thinking through your coursework…</div>}</div><form className="chat-compose" onSubmit={event => { event.preventDefault(); ask("chat"); }}><input value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about deadlines, grades, or course material…" aria-label="Message" disabled={busy} /><Button type="submit" size="icon" aria-label="Send message" disabled={busy || !question.trim()}><Send size={18} /></Button></form>{!data.aiAvailable && <p className="chat-disabled">AI answers are ready to turn on when an OpenAI API key is added to this site.</p>}</section>
    <aside className="content-panel chat-tools"><p className="eyebrow">STUDY TOOLS</p><h3>Practice this material</h3><p>These tools use readable text from your uploaded files.</p><button onClick={() => ask("flashcards", `Make flashcards for ${course?.name || "my courses"}.`)}><span><Layers3 size={19} /></span><strong>Make flashcards</strong><ArrowUpRight size={16} /></button><button onClick={() => ask("quiz", `Make a practice quiz for ${course?.name || "my courses"}.`)}><span><BookOpen size={19} /></span><strong>Practice quiz</strong><ArrowUpRight size={16} /></button><div className="chat-source-note"><strong>{materials.length} course file{materials.length === 1 ? "" : "s"}</strong><small>{materials.some(m => m.preview) ? "Readable text available for chat" : "Upload a syllabus, notes, or textbook excerpt"}</small></div><div className="resource-links"><p className="eyebrow">EXPLORE MORE</p><a href={`https://www.youtube.com/results?search_query=${query}`} target="_blank" rel="noreferrer"><Video size={17} /> Search study videos <ArrowUpRight size={15} /></a><a href={`https://quizlet.com/search?query=${query}`} target="_blank" rel="noreferrer"><Layers3 size={17} /> Search Quizlet sets <ArrowUpRight size={15} /></a></div></aside>
  </div>;
}
