"use client";
import { useState } from "react";
import Link from "next/link";
export default function PairClient({ code }: { code: string }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/extension/pair/confirm", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Pairing failed.");
      window.history.replaceState(null, "", "/extension/pair");
      setStatus("Paired. Return to the Coursewise side panel and click Finish pairing.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Pairing failed."); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 500, margin: "6rem auto", padding: "2rem", lineHeight: 1.6 }}>
    <h1 style={{ fontSize: "2rem", fontWeight: 700 }}>Pair Coursewise</h1>
    <p>Confirm that this Chrome extension may ask Coursewise questions using your saved course materials. Page text is sent only when you include it in a question. Pairing lasts one hour and can be revoked by signing out of the extension.</p>
    <button type="button" onClick={confirm} disabled={busy || !/^[a-f0-9]{48}$/.test(code)}
      style={{ padding: "0.75rem 1rem", borderRadius: 8, background: "#173c62", color: "white" }}>
      {busy ? "Pairing…" : "Confirm pairing"}
    </button>
    <p role="status">{status || (!code ? "Open this page from the extension to get a pairing code." : "")}</p>
    <Link href="/">Open Coursewise</Link>
  </main>;
}
