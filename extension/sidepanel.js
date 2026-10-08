"use strict";
const API = "http://localhost:5173";
const labels = { url: "Canvas URL", pageTitle: "Page title", courseName: "Course name", courseCode: "Course code", assignmentTitle: "Assignment title", dueText: "Due date", pointsText: "Points", instructions: "Visible instructions" };
const $ = id => document.getElementById(id);
let conversationId = null, conversationKey = "", chatRetry = null;
let context = null, capturedTab = null, stale = false, busy = false, token = null, expiresAt = 0, pairCode = null, expiryTimer = null;
async function api(path, payload, bearer = token) {
  const response = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || `Coursewise returned ${response.status}.`); error.status = response.status; throw error; }
  return data;
}
function renderContext(message = "") {
  const status = $("freshness");
  status.textContent = context ? stale ? "Stale · refresh" : "Fresh" : "Not captured";
  status.className = `status ${context ? stale ? "stale" : "fresh" : ""}`;
  $("course").textContent = context?.courseName || context?.courseCode || "No Canvas course captured";
  $("context-message").textContent = message || (stale ? "The active Canvas page changed. Refresh before asking." : context ? "Review the exact fields below before submitting." : "Open a Canvas course or assignment page, then refresh.");
  $("fields").replaceChildren();
  if (context) for (const [key, label] of Object.entries(labels)) if (context[key]) {
    const dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = label; dd.textContent = context[key]; $("fields").append(dt, dd);
  }
  $("preview").hidden = !context;
  $("clear").disabled = !context;
  $("submit").disabled = busy || stale;
}
function renderPair(message = "") {
  const paired = Boolean(token && expiresAt > Date.now());
  $("pair-status").textContent = message || (paired ? `Paired until ${new Date(expiresAt).toLocaleTimeString()}.` : pairCode ? "Confirm in the Coursewise tab, then finish pairing." : "Pair to ask about saved Coursewise materials.");
  $("pair").hidden = paired || Boolean(pairCode);
  $("finish").hidden = !pairCode;
  $("signout").hidden = !paired;
}
async function forgetToken() { if (expiryTimer) clearTimeout(expiryTimer); expiryTimer = null; token = null; expiresAt = 0; await chrome.storage.session.remove(["extensionToken", "expiresAt"]); renderPair("Session expired or signed out. Pair again."); }
function scheduleExpiry() {
  if (expiryTimer) clearTimeout(expiryTimer);
  if (token) expiryTimer = setTimeout(forgetToken, Math.max(0, expiresAt - Date.now()));
}
async function currentTab() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return tab; }
async function refresh() {
  $("refresh").disabled = true;
  try {
    const tab = await currentTab();
    if (!tab?.id || !/^https:\/\/canvas\.upenn\.edu\//.test(tab.url || "")) {
      context = null; capturedTab = null; stale = false; renderContext("No Canvas context detected. Open a course or assignment on canvas.upenn.edu."); return;
    }
    const result = await chrome.tabs.sendMessage(tab.id, { type: "COURSEWISE_EXTRACT" });
    const stillActive = await currentTab();
    if (stillActive?.id !== tab.id || stillActive.url !== tab.url) {
      context = null; capturedTab = null; stale = false; renderContext("Canvas changed while refreshing. Refresh again."); return;
    }
    context = result?.supported ? result.context : null;
    capturedTab = context ? { id: tab.id, url: tab.url } : null;
    stale = false;
    renderContext(context ? "Review the exact fields below before submitting." : result?.message || "No Canvas context detected on this page.");
  } catch { context = null; capturedTab = null; stale = false; renderContext("Could not read this Canvas page. Reload it, then refresh context."); }
  finally { $("refresh").disabled = false; }
}
$("refresh").addEventListener("click", refresh);
$("data-consent").addEventListener("change", event => { $("continue").disabled = !event.target.checked; });
$("continue").addEventListener("click", async () => {
  if (!$("data-consent").checked) return;
  await chrome.storage.local.set({ cwDataConsent: true });
  $("disclosure").hidden = true;
  $("extension-content").hidden = false;
  await refresh();
});
$("clear").addEventListener("click", () => { context = null; capturedTab = null; stale = false; renderContext("Captured context cleared. Your question is still here."); });
$("pair").addEventListener("click", async () => {
  $("pair").disabled = true;
  try {
    const data = await api("/api/extension/pair/start", {});
    pairCode = data.code;
    await chrome.tabs.create({ url: `${API}/extension/pair?code=${encodeURIComponent(pairCode)}` });
    renderPair();
  } catch (error) { renderPair(`Could not start pairing: ${error.message} Check that Coursewise is running at ${API}.`); }
  finally { $("pair").disabled = false; }
});
$("finish").addEventListener("click", async () => {
  $("finish").disabled = true;
  try {
    const data = await api("/api/extension/pair/complete", { code: pairCode });
    token = data.token; expiresAt = data.expiresAt; pairCode = null;
    await chrome.storage.session.set({ extensionToken: token, expiresAt });
    scheduleExpiry();
    renderPair("Paired. You can ask Coursewise now.");
  } catch (error) { if (error.status === 403) pairCode = null; renderPair(error.message); }
  finally { $("finish").disabled = false; }
});
$("signout").addEventListener("click", async () => {
  const old = token; await forgetToken();
  if (old) try { await api("/api/extension/session", {}, old); } catch { /* local token already cleared */ }
});
$("new-chat").addEventListener("click", () => { if (busy) return; conversationId = null; chatRetry = null; $("chat-history").replaceChildren(); $("answer-box").hidden = true; });
$("ask-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  const question = $("question").value.trim();
  if (!question) { $("request-status").textContent = "Enter a question first."; $("question").focus(); return; }
  if (!token || expiresAt <= Date.now()) { await forgetToken(); $("request-status").textContent = "Pair the extension before asking."; return; }
  const tab = await currentTab();
  if (capturedTab && (tab?.id !== capturedTab.id || tab.url !== capturedTab.url)) { stale = true; renderContext(); $("request-status").textContent = "Canvas changed. Refresh context before submitting."; return; }
  busy = true; $("request-status").textContent = "Asking Coursewise…"; $("answer-box").hidden = true; renderContext();
  try {
    const key = context?.url?.match(/\/courses\/(\d+)/)?.[1] || context?.courseCode || context?.courseName || "page";
    if (key !== conversationKey) { conversationKey = key; conversationId = null; chatRetry = null; $("chat-history").replaceChildren(); }
    if (chatRetry?.question !== question) chatRetry = { question, id: crypto.randomUUID() };
    const data = await api("/api/extension/study", { question, canvasContext: context || {}, conversationId, requestId: chatRetry.id });
    conversationId = data.conversationId; chatRetry = null;
    const turn = document.createElement("article"), heading = document.createElement("strong"), reply = CoursewiseChatFormat.render(data.answer);
    heading.textContent = question; turn.append(heading, reply);
    const sources = document.createElement("details"), summary = document.createElement("summary"); summary.textContent = "Sources supplied"; sources.append(summary);
    for (const source of data.sources || []) { const line = document.createElement("p"); line.textContent = source; sources.append(line); } turn.append(sources); $("chat-history").append(turn);
    $("question").value = ""; $("question").placeholder = "Ask a follow-up…";
    $("answer").textContent = data.answer;
    $("sources").replaceChildren();
    for (const source of data.sources || []) { const li = document.createElement("li"); li.textContent = source; $("sources").append(li); }
    $("answer-box").hidden = true; $("request-status").textContent = "Saved to your Coursewise conversations.";
  } catch (error) {
    if (error.status === 401) await forgetToken();
    $("request-status").textContent = error.message + (error.status ? "" : ` Check that Coursewise is running at ${API}.`);
  } finally { busy = false; renderContext(); }
});
chrome.tabs.onActivated.addListener(() => { if (context) { stale = true; renderContext(); } });
chrome.tabs.onUpdated.addListener((tabId, change) => { if (context && capturedTab?.id === tabId && (change.url || change.status === "loading")) { stale = true; renderContext(); } });
(async () => {
  const consent = await chrome.storage.local.get("cwDataConsent");
  if (consent.cwDataConsent !== true) { $("disclosure").hidden = false; $("extension-content").hidden = true; return; }
  $("disclosure").hidden = true;
  $("extension-content").hidden = false;
  const saved = await chrome.storage.session.get(["extensionToken", "expiresAt"]);
  token = saved.extensionToken || null; expiresAt = saved.expiresAt || 0;
  if (token && expiresAt <= Date.now()) await forgetToken(); else { renderPair(); scheduleExpiry(); }
  await refresh();
})();
