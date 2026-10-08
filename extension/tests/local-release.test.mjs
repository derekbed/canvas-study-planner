import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

test("local release supports user-granted school origins without website or AI code", () => {
  const out = mkdtempSync(join(tmpdir(), "coursewise-local-"));
  try {
    const result = spawnSync(process.execPath, [new URL("../scripts/build-local-release.mjs", import.meta.url).pathname,
      "--out", out], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    assert.deepEqual(manifest.host_permissions, []);
    assert.deepEqual(manifest.optional_host_permissions, ["https://*/*"]);
    assert.deepEqual(manifest.permissions, ["sidePanel", "storage", "scripting"]);
    assert.equal(manifest.minimum_chrome_version, "119");
    assert.equal(manifest.key, undefined);
    assert.equal(manifest.content_scripts, undefined);
    assert.ok(!readdirSync(out).includes("canvas-app.js"));
    assert.ok(!readdirSync(out).includes("content.js"));
    assert.match(readFileSync(join(out, "background.js"), "utf8"), /registerContentScripts/);
    assert.match(readFileSync(join(out, "insights-model.js"), "utf8"), /const ORIGIN = location\.origin/);
    assert.match(readFileSync(join(out, "insights.js"), "utf8"), /cwReadAssignmentsV1:" \+ location\.origin/);
    for (const file of ["background.js", "sidepanel.html", "sidepanel.js", "insights.js", "insights-model.js", "course-health.js"]) {
      const content = readFileSync(join(out, file), "utf8");
      assert.doesNotMatch(content, /localhost:5173|canvas\.upenn\.edu|\/api\/extension|OpenAI|startPairing|askCoursewise/, file);
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("schools register separately and a disconnected school loses access and settings", async () => {
  const code = readFileSync(new URL("../local/background.js", import.meta.url), "utf8");
  const storage = { cwDataConsent: true };
  const granted = new Set(["https://one.example.edu/*", "https://two.example.edu/*"]);
  const scripts = new Map();
  let listener, removedListener;
  const chrome = {
    runtime: { id: "local-extension", onMessage: { addListener(fn) { listener = fn; } } },
    sidePanel: { setPanelBehavior() {} },
    storage: { local: {
      async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, storage[key]])); },
      async set(data) { Object.assign(storage, data); }
    } },
    permissions: {
      async contains({ origins }) { return origins.every(origin => granted.has(origin)); },
      async remove({ origins }) { origins.forEach(origin => granted.delete(origin)); return true; },
      onRemoved: { addListener(fn) { removedListener = fn; } }
    },
    scripting: {
      async getRegisteredContentScripts() { return [...scripts.values()]; },
      async registerContentScripts(rows) { rows.forEach(row => scripts.set(row.id, row)); },
      async unregisterContentScripts({ ids }) { ids.forEach(id => scripts.delete(id)); }
    }
  };
  vm.runInNewContext(code, { chrome, URL, btoa, console, Promise });
  const send = (message, url) => new Promise(resolve => listener(message,
    url ? { id: chrome.runtime.id, tab: {}, url } : { id: chrome.runtime.id }, resolve));
  assert.equal((await send({ type: "cw:addSchool", origin: "https://one.example.edu" })).ok, true);
  assert.equal((await send({ type: "cw:addSchool", origin: "https://two.example.edu" })).ok, true);
  assert.equal(scripts.size, 4);
  assert.ok([...scripts.values()].some(script => script.matchOriginAsFallback === true));
  const one = "https://one.example.edu/courses/1", two = "https://two.example.edu/courses/1";
  assert.equal((await send({ type: "cw:syncCourses", courses: [{ canvasId: "1", name: "Math" }] }, one)).ok, true);
  assert.equal((await send({ type: "cw:syncCourses", courses: [{ canvasId: "1", name: "Science" }] }, two)).ok, true);
  assert.equal((await send({ type: "cw:styleCourse", courseId: "1", color: "mint" }, one)).ok, true);
  assert.equal((await send({ type: "cw:getWorkspace" }, one)).data.courses[0].color, "mint");
  assert.equal((await send({ type: "cw:getWorkspace" }, two)).data.courses[0].color, undefined);
  assert.equal((await send({ type: "cw:removeSchool", origin: "https://one.example.edu" })).ok, true);
  assert.equal(scripts.size, 2);
  assert.equal(storage.cwLocalSchools["https://one.example.edu"], undefined);
  assert.equal((await send({ type: "cw:getWorkspace" }, one)).ok, false);
  assert.equal(typeof removedListener, "function");
});
