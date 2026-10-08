import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
const source = name => fs.readFileSync(path.join(import.meta.dirname, "..", name), "utf8");

test("toolbar enables the side panel and has a website fallback", () => {
  let panelBehavior, clicked, opened;
  vm.runInNewContext(source("background.js"), { chrome: {
    sidePanel: { setPanelBehavior(value) { panelBehavior = value; } }, action: { onClicked: { addListener() { throw new Error("Fallback should not be active"); } } },
    runtime: { onMessage: { addListener() {} } }
  } });
  assert.equal(panelBehavior.openPanelOnActionClick, true);
  vm.runInNewContext(source("background.js"), { chrome: {
    action: { onClicked: { addListener(listener) { clicked = listener; } } }, tabs: { create(value) { opened = value.url; } },
    runtime: { onMessage: { addListener() {} } }
  } });
  clicked(); assert.equal(opened, "http://localhost:5173/");
});

function panelHarness({ paired = false } = {}) {
  const elements = new Map(), listeners = new Map(); let fetchCount = 0;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: "", textContent: "", hidden: false, disabled: false, className: "",
      addEventListener(type, listener) { listeners.set(`${id}:${type}`, listener); },
      replaceChildren() {}, append() {}, focus() {}
    });
    return elements.get(id);
  }
  const chrome = { storage: { local: {
    async get() { return { cwDataConsent: true }; },
    async remove() {}, async set() {}
  }, session: {
    async get() { return paired ? { extensionToken: "a".repeat(48), expiresAt: Date.now() + 60_000 } : {}; },
    async remove() {}, async set() {}
  } }, tabs: {
    async query() { return [{ id: 1, url: "https://example.edu/" }]; },
    onActivated: { addListener() {} }, onUpdated: { addListener() {} }
  } };
  vm.runInNewContext(source("sidepanel.js"), {
    chrome, document: { getElementById: element, createElement: () => ({ textContent: "" }) },
    fetch: async () => { fetchCount++; throw new Error("Offline"); },
    setTimeout: () => 1, clearTimeout() {}, Date, console
  });
  return { element, listeners, get fetchCount() { return fetchCount; } };
}
test("refresh never submits page text and a failed question remains editable", async () => {
  const panel = panelHarness({ paired: true });
  await new Promise(resolve => setImmediate(resolve));
  await panel.listeners.get("refresh:click")();
  assert.equal(panel.fetchCount, 0);
  panel.element("question").value = "Keep this question";
  await panel.listeners.get("ask-form:submit")({ preventDefault() {} });
  assert.equal(panel.element("question").value, "Keep this question");
  assert.match(panel.element("request-status").textContent, /Check that Coursewise is running/);
});
test("missing session asks the student to pair without sending a request", async () => {
  const panel = panelHarness();
  await new Promise(resolve => setImmediate(resolve));
  panel.element("question").value = "What should I review?";
  await panel.listeners.get("ask-form:submit")({ preventDefault() {} });
  assert.equal(panel.fetchCount, 0);
  assert.match(panel.element("request-status").textContent, /Pair the extension/);
  assert.equal(panel.element("question").value, "What should I review?");
});
