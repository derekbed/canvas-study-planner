"use strict";
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const defaults = { canvasBackground: "#f7faf9", canvasThemeMode: "light", deadlineWindowDays: 14, showCardGrades: true };
const PREFERENCE_KEYS = Object.keys(defaults);
const MAIN_FILES = ["insights-model.js", "course-health.js", "vendor/libheif-without-unsafe-eval.js", "course-image.js", "insights.js"];
let saveQueue = Promise.resolve();
let schoolQueue = Promise.resolve();
function validOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password && !url.port && url.origin === value;
  } catch { return false; }
}
function ids(origin) {
  const key = btoa(origin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return [`cw-main-${key}`, `cw-frame-${key}`, `cw-boot-${key}`];
}
async function schoolData() {
  const saved = await chrome.storage.local.get("cwLocalSchools");
  return saved.cwLocalSchools && typeof saved.cwLocalSchools === "object" ? saved.cwLocalSchools : {};
}
function updateSchools(change, notifyAppearance = false) {
  const task = schoolQueue.then(async () => {
    const schools = await schoolData();
    const result = change(schools);
    await chrome.storage.local.set({ cwLocalSchools: schools, ...(notifyAppearance ? { cwCourseAppearanceUpdated: Date.now() } : {}) });
    return result;
  });
  schoolQueue = task.catch(() => {});
  return task;
}
async function registerSchoolScripts(origin) {
  if (!validOrigin(origin)) throw new Error("Enter a valid HTTPS Canvas domain.");
  if (!await chrome.permissions.contains({ origins: [`${origin}/*`] })) throw new Error("Allow access to this Canvas domain first.");
  const [main, frame, boot] = ids(origin);
  const existing = new Map((await chrome.scripting.getRegisteredContentScripts()).map(script => [script.id, script]));
  const registrations = [
    { id: boot, matches: [`${origin}/*`], js: ["palette.js", "theme-bootstrap.js"], css: ["theme-bootstrap.css", "appearance.css"], runAt: "document_start", persistAcrossSessions: true },
    { id: main, matches: [`${origin}/*`], js: MAIN_FILES, css: ["insights.css"], runAt: "document_idle", persistAcrossSessions: true },
    { id: frame, matches: [`${origin}/*`], allFrames: true, matchOriginAsFallback: true, js: ["appearance-frame.js"], css: ["appearance-frame.css"], runAt: "document_idle", persistAcrossSessions: true }
  ];
  const changed = registrations.filter(script => {
    const old = existing.get(script.id);
    return old && ["matches", "js", "css", "runAt", "allFrames", "matchOriginAsFallback"].some(key => JSON.stringify(old[key] || null) !== JSON.stringify(script[key] || null));
  });
  if (changed.length) await chrome.scripting.unregisterContentScripts({ ids: changed.map(script => script.id) });
  const needed = registrations.filter(script => !existing.has(script.id) || changed.includes(script));
  if (needed.length) await chrome.scripting.registerContentScripts(needed);
}
async function addSchool(origin) {
  await registerSchoolScripts(origin);
  return updateSchools(schools => {
    schools[origin] ||= { courses: [], styles: {} };
    return { origins: Object.keys(schools).sort() };
  });
}
async function restoreSchoolScripts() {
  const schools = await schoolData();
  for (const origin of Object.keys(schools)) {
    try { await registerSchoolScripts(origin); }
    catch { /* The permission may have been revoked; the next side-panel connection repairs it. */ }
  }
}
async function forgetSchool(origin) {
  const registered = new Set((await chrome.scripting.getRegisteredContentScripts()).map(script => script.id));
  const scripts = ids(origin).filter(id => registered.has(id));
  if (scripts.length) await chrome.scripting.unregisterContentScripts({ ids: scripts });
  return updateSchools(schools => {
    delete schools[origin];
    return { origins: Object.keys(schools).sort() };
  });
}
async function removeSchool(origin) {
  if (!validOrigin(origin)) throw new Error("Invalid Canvas domain.");
  await chrome.permissions.remove({ origins: [`${origin}/*`] });
  return forgetSchool(origin);
}
function savePreferences(patch) {
  const task = saveQueue.then(async () => {
    const saved = await chrome.storage.local.get("cwCanvasPreferences");
    const next = { ...defaults, ...saved.cwCanvasPreferences, ...patch };
    if (!/^#[0-9a-f]{6}$/i.test(next.canvasBackground) || !["light", "dark", "system"].includes(next.canvasThemeMode) || ![1, 3, 7, 14, 30].includes(next.deadlineWindowDays) || typeof next.showCardGrades !== "boolean")
      throw new Error("Choose valid Coursewise settings.");
    await chrome.storage.local.set({ cwCanvasPreferences: next });
    return next;
  });
  saveQueue = task.catch(() => {});
  return task;
}
async function handle(message, sender) {
  const saved = await chrome.storage.local.get("cwDataConsent");
  if (saved.cwDataConsent !== true) throw new Error("Accept the data disclosure in the side panel first.");
  if (!sender.tab) {
    if (message.type === "cw:addSchool") return addSchool(message.origin);
    if (message.type === "cw:removeSchool") return removeSchool(message.origin);
    if (message.type === "cw:listSchools") return { origins: Object.keys(await schoolData()).sort() };
    throw new Error("Unknown extension setting.");
  }
  const origin = new URL(sender.url).origin;
  if (!validOrigin(origin) || !await chrome.permissions.contains({ origins: [`${origin}/*`] })) throw new Error("This Canvas domain is not connected.");
  switch (message.type) {
    case "cw:getPreferences": return savePreferences({});
    case "cw:setPreferences":
      return savePreferences(Object.fromEntries(PREFERENCE_KEYS.filter(key => message[key] !== undefined).map(key => [key, message[key]])));
    case "cw:syncCourses": {
      const rows = Array.isArray(message.courses) ? message.courses : [];
      const courses = rows.slice(0, 200).filter(row => /^\d+$/.test(String(row.canvasId)) && typeof row.name === "string")
        .map(row => ({ id: String(row.canvasId), canvas_id: String(row.canvasId), name: row.name.slice(0, 160) }));
      return updateSchools(schools => {
        schools[origin] ||= { courses: [], styles: {} };
        schools[origin].courses = courses;
        return { count: courses.length };
      });
    }
    case "cw:getWorkspace": {
      await schoolQueue;
      const school = (await schoolData())[origin] || { courses: [], styles: {} };
      return { courses: school.courses.map(course => ({ ...course, ...(school.styles?.[course.id] || {}) })) };
    }
    case "cw:styleCourse": {
      const id = String(message.courseId || "");
      const color = String(message.color || "blue");
      if (!["blue", "lavender", "peach", "mint", "butter", "rose", "sky", "teal", "violet", "orange"].includes(color))
        throw new Error("Choose a valid course color.");
      const imageUrl = message.imageUrl || "";
      if (typeof imageUrl !== "string" || (imageUrl && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(imageUrl) || imageUrl.length > 700000)))
        throw new Error("Choose a supported course picture.");
      return updateSchools(schools => {
        const school = schools[origin];
        if (!school?.courses?.some(course => course.id === id)) throw new Error("Choose a Canvas course.");
        school.styles ||= {};
        school.styles[id] = { color, image_url: imageUrl };
        return { color, imageUrl };
      }, true);
    }
    default: throw new Error("This feature is unavailable in the local edition.");
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!message || typeof message.type !== "string" || !message.type.startsWith("cw:")) return;
  if (sender.id !== chrome.runtime.id || (sender.tab && !sender.url?.startsWith("https://"))) return;
  handle(message, sender).then(data => reply({ ok: true, data })).catch(error => reply({ ok: false, error: { message: String(error.message).slice(0, 240) } }));
  return true;
});
chrome.permissions.onRemoved.addListener(({ origins = [] }) => {
  for (const pattern of origins) {
    const origin = pattern.endsWith("/*") ? pattern.slice(0, -2) : "";
    if (validOrigin(origin)) forgetSchool(origin).catch(() => {});
  }
});
chrome.runtime.onStartup?.addListener(() => { restoreSchoolScripts().catch(() => {}); });
chrome.runtime.onInstalled?.addListener(() => { restoreSchoolScripts().catch(() => {}); });
