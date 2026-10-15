"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Workspace } from "@/lib/client-types";

export default function PrivacyView({ data, onMutate }: { data: Workspace; onMutate: (action: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [confirm, setConfirm] = useState("");
  const [course, setCourse] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="dashboard">
    <section className="content-panel">
      <h2>Your data and privacy</h2>
      <p>Coursewise stores your courses, dates, uploaded files, review cards, and study records for your signed-in account.</p>
      <p>Calendar feed links are used only for the current import and are never stored. Each import replaces only the previous Canvas calendar feed; use the same feed for subsequent imports.</p>
      <p>Uploaded files stay in your account. Use only material you are authorized to share. Data remains until you delete it. Deleting a course removes its dates, files, and study records. Deleting the workspace also disconnects Canvas and clears preferences. Copies you downloaded and provider backups are outside this control. <a href="/privacy-policy">Read the full privacy notice</a>.</p>
    </section>
    <section className="content-panel">
      <h3>Export your work</h3>
      <div className="heading-actions"><a className="inline-link" href="/api/export">Download workspace data (JSON)</a><a className="inline-link" href="/api/export?format=ics">Download calendar (.ics)</a></div>
      <p>Import the .ics file using Google Calendar’s Import & export settings, or open it in Apple Calendar. This is a snapshot; download again after changes.</p>
      <h4>Original uploaded files</h4>
      {data.materials.length ? data.materials.map(material => <p key={material.id}><a href={`/api/materials/${encodeURIComponent(material.id)}`}>{material.name}</a></p>) : <p>No uploaded files.</p>}
    </section>
    <section className="content-panel">
      <h3>Delete data</h3>
      <form className="form-stack" onSubmit={async event => {
        event.preventDefault(); setBusy(true);
        try { await onMutate(course ? "course:delete" : "workspace:delete", { id: course, confirm }); setConfirm(""); setCourse(""); toast.success("Data deleted."); }
        catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete. Try again."); }
        finally { setBusy(false); }
      }}>
        <label>What to delete<select value={course} onChange={event => setCourse(event.target.value)}><option value="">Entire workspace</option>{data.courses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Type DELETE to confirm permanent removal<input value={confirm} onChange={event => setConfirm(event.target.value)} autoComplete="off" /></label>
        <Button variant="destructive" disabled={confirm !== "DELETE" || busy}>Delete {course ? "course" : "workspace"}</Button>
      </form>
    </section>
  </div>;
}
