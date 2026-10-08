const workspaceUrl = "http://localhost:5173/";
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
} else {
  chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: workspaceUrl }));
}

const API = "http://localhost:5173";
// Appearance belongs to this browser and must work without an account or server.
let appearanceQueue = Promise.resolve();
function appearancePreferences(patch) {
  const operation = appearanceQueue.then(async () => {
    const saved = await chrome.storage.local.get("cwCanvasPreferences");
    let preferences = saved.cwCanvasPreferences;
    if (!preferences) {
      try { preferences = await request("/api/extension/preferences", { method: "GET" }); }
      catch { preferences = {}; }
    }
    const next = { canvasBackground: "#f7faf9", canvasThemeMode: "light", ...preferences, ...patch };
    if (!/^#[0-9a-f]{6}$/i.test(next.canvasBackground) || !["light", "dark", "system"].includes(next.canvasThemeMode))
      throw { status: 400, message: "Choose a valid background color and appearance mode." };
    await chrome.storage.local.set({ cwCanvasPreferences: next });
    return next;
  });
  appearanceQueue = operation.catch(() => {});
  return operation;
}
async function session() {
  const saved = await chrome.storage.local.get(["extensionToken", "expiresAt"]);
  if (!saved.extensionToken || !saved.expiresAt || saved.expiresAt <= Date.now()) {
    await chrome.storage.local.remove(["extensionToken", "expiresAt"]);
    return null;
  }
  return { token: saved.extensionToken, expiresAt: saved.expiresAt };
}
async function request(path, { method = "POST", body, bearer = true } = {}) {
  const current = bearer ? await session() : null;
  if (bearer && !current) throw { status: 401, message: "Pair Coursewise to continue." };
  let response;
  try {
    response = await fetch(API + path, { method, cache: "no-store",
      headers: { ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(current ? { Authorization: `Bearer ${current.token}` } : {}) },
      ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
  } catch { throw { status: 503, message: "Coursewise is not reachable at http://localhost:5173." }; }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) await chrome.storage.local.remove(["extensionToken", "expiresAt"]);
  if (!response.ok) throw { status: response.status, message: typeof data.error === "string" ? data.error.slice(0, 240) : "Coursewise request failed." };
  return data;
}
function decodeBase64(value) {
  const binary = atob(value), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function handle(message) {
  switch (message.type) {
    case "cw:getSession": {
      const current = await session();
      return { paired: Boolean(current), expiresAt: current?.expiresAt || 0 };
    }
    case "cw:startPairing": {
      const data = await request("/api/extension/pair/start", { body: {}, bearer: false });
      await chrome.tabs.create({ url: `${API}/extension/pair?code=${encodeURIComponent(data.code)}` });
      return { code: data.code, expiresInSeconds: data.expiresInSeconds };
    }
    case "cw:completePairing": {
      const data = await request("/api/extension/pair/complete", { body: { code: message.code }, bearer: false });
      await chrome.storage.local.set({ extensionToken: data.token, expiresAt: data.expiresAt });
      return { paired: true, expiresAt: data.expiresAt };
    }
    case "cw:signOut": {
      const current = await session();
      await chrome.storage.local.remove(["extensionToken", "expiresAt"]);
      if (current) try {
        await fetch(`${API}/api/extension/session`, { method: "POST", headers: { Authorization: `Bearer ${current.token}` } });
      } catch { /* local session is already removed */ }
      return { paired: false };
    }
    case "cw:getWorkspace": return request("/api/extension/workspace", { body: {} });
    case "cw:getPreferences": {
      return appearancePreferences();
    }
    case "cw:setPreferences": {
      const patch = {};
      if (message.canvasBackground !== undefined) patch.canvasBackground = message.canvasBackground;
      if (message.canvasThemeMode !== undefined) patch.canvasThemeMode = message.canvasThemeMode;
      return appearancePreferences(patch);
    }
    case "cw:saveCourse": return request("/api/extension/course", { body: { canvasId: message.canvasId, name: message.name, code: message.code } });
    case "cw:renameCourse": return request("/api/extension/course", { body: { action: "rename", courseId: message.courseId, name: message.name } });
    case "cw:styleCourse": {
      const result = await request("/api/extension/course", { body: { action: "style", courseId: message.courseId, color: message.color, imageUrl: message.imageUrl } });
      await chrome.storage.local.set({ cwCourseAppearanceUpdated: Date.now() });
      return result;
    }
    case "cw:getKnowledge": return request("/api/extension/knowledge", { body: { action: "get", courseId: message.courseId } });
    case "cw:saveKnowledge": return request("/api/extension/knowledge", { body: { action: "save", courseId: message.courseId, key: message.key, value: message.value } });
    case "cw:analyzeKnowledge": return request("/api/extension/knowledge/analyze", { body: { courseId: message.courseId, materialId: message.materialId } });
    case "cw:uploadMaterial": {
      const { file } = message;
      if (!file || !["application/pdf", "text/plain", "text/markdown"].includes(file.type) ||
          !/\.(pdf|txt|md)$/i.test(file.name) || file.size > 5 * 1024 * 1024 ||
          typeof file.base64 !== "string" || file.base64.length > 7_000_000) throw { status: 400, message: "Choose a PDF, TXT, or Markdown file under 5 MB." };
      const bytes = decodeBase64(file.base64);
      if (bytes.length !== file.size) throw { status: 400, message: "File could not be read. Select it again." };
      return request("/api/extension/materials", { body: { courseId: message.courseId,
        kind: message.kind === "syllabus" ? "syllabus" : "notes", file } });
    }
    case "cw:deleteMaterial": {
      if (typeof message.id !== "string" || !/^[a-f0-9-]{36}$/.test(message.id)) throw { status: 400, message: "Invalid material." };
      return request(`/api/extension/materials/${message.id}`, { method: "DELETE" });
    }
    case "cw:listChats": return request(`/api/extension/chats?courseId=${encodeURIComponent(message.courseId || "")}`, { method: "GET" });
    case "cw:getChat": return request(`/api/extension/chats?id=${encodeURIComponent(message.id || "")}${message.before ? `&before=${encodeURIComponent(message.before)}` : ""}`, { method: "GET" });
    case "cw:manageChat": return request("/api/extension/chats", { body: message.payload });
    case "cw:askCoursewise": return request("/api/extension/chat", { body: message.payload });
    default: throw { status: 400, message: "Unknown Coursewise request." };
  }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.tab || !/^https:\/\/canvas\.upenn\.edu\//.test(sender.url || "") ||
      !message || typeof message.type !== "string" || !message.type.startsWith("cw:")) return;
  handle(message).then(data => sendResponse({ ok: true, data })).catch(error =>
    sendResponse({ ok: false, error: { status: Number(error?.status) || 503, message: String(error?.message || "Coursewise request failed.").slice(0, 240) } }));
  return true;
});
