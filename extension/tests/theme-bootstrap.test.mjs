import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const paletteCode = readFileSync(new URL("../palette.js", import.meta.url), "utf8");
const bootstrapCode = readFileSync(new URL("../theme-bootstrap.js", import.meta.url), "utf8");
const cacheKey = "cwCanvasThemeV1:test-extension";
function element() {
  const classes = new Set();
  const properties = new Map();
  return {
    classes, properties,
    classList: {
      add(...names) { names.forEach(name => classes.add(name)); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }
    },
    style: {
      setProperty(name, value) { properties.set(name, value); },
      removeProperty(name) { properties.delete(name); }
    }
  };
}
function page({ preferences, storage = new Map(), systemDark = false, blocked = false, frames = [] } = {}) {
  if (preferences) storage.set(cacheKey, JSON.stringify(preferences));
  const document = { body: null, documentElement: element(), querySelectorAll(selector) { return selector === "iframe" ? frames : []; } };
  let changed, resolveStorage, rejectStorage;
  const stored = new Promise((resolve, reject) => { resolveStorage = resolve; rejectStorage = reject; });
  const context = vm.createContext({
    document,
    location: { href: "https://canvas.upenn.edu/courses/123", origin: "https://canvas.upenn.edu" },
    URL,
    MutationObserver: class { constructor(fn) { changed = fn; } observe() {} },
    matchMedia() { return { matches: systemDark }; },
    localStorage: {
      getItem(key) { if (blocked) throw new Error("Blocked"); return storage.get(key) || null; },
      setItem(key, value) { if (blocked) throw new Error("Blocked"); storage.set(key, value); },
      removeItem(key) { storage.delete(key); }
    },
    chrome: { runtime: { id: "test-extension" }, storage: { local: { get() { return stored; } } } }
  });
  vm.runInContext(paletteCode, context);
  vm.runInContext(bootstrapCode, context);
  return {
    document, storage, palette: context.CoursewiseCanvasPalette, resolveStorage, rejectStorage,
    color() { return document.documentElement.properties.get("--cw-canvas-background"); },
    insertBody() { document.body = element(); changed?.(); }
  };
}

for (const [color, expected] of [["#f7faf9", "#f2f9f6"], ["#ffedf2", "#ffedf2"], ["#e9f8ef", "#e9f8ef"], ["#293b48", "#293b48"]]) {
  test(`saved light color ${color} paints before asynchronous storage, body, or idle scripts`, () => {
    const view = page({ preferences: { canvasBackground: color, canvasThemeMode: "light" } });
    assert.equal(view.color(), expected);
    assert.equal(view.document.documentElement.style.colorScheme, "light");
    view.insertBody();
    assert.equal(view.document.body.classes.has("cw-canvas-themed"), true);
    assert.equal(view.document.body.classes.has("cw-canvas-dark"), false);
    const reloaded = page({ storage: view.storage });
    assert.equal(reloaded.color(), expected);
  });
}

test("dark mode starts dark even when the operating system is light", () => {
  const view = page({ preferences: { canvasBackground: "#ffedf2", canvasThemeMode: "dark" } });
  assert.equal(view.color(), "#111923");
  view.insertBody();
  assert.equal(view.document.body.classes.has("cw-canvas-dark"), true);
});

test("calendar events use a softer surface with readable text across themes", () => {
  const rgb = color => [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  for (const [color, dark] of [
    ...["#f2f9f6", "#f2edff", "#fff0e5", "#e9f8ef", "#fff8d7", "#ffedf2", "#e8f4ff", "#e2888c", "#293b48"].map(color => [color, false]),
    ["#ffedf2", true]
  ]) {
    const view = page({ preferences: { canvasBackground: color, canvasThemeMode: dark ? "dark" : "light" } });
    const tokens = view.document.documentElement.properties;
    const surface = tokens.get("--cw-calendar-event-surface");
    assert.notEqual(surface, view.color());
    assert.ok(view.palette.contrast(rgb(surface), rgb(tokens.get("--cw-canvas-ink"))) >= 4.5, `${color} event text contrast`);
  }
});

test("the selected theme reaches embedded Canvas assessment frames", () => {
  const received = [];
  const frame = {
    getAttribute() { return "/courses/123/assignments/456/taking/789"; },
    addEventListener(_type, listener) { this.onload = listener; },
    contentWindow: { postMessage(message) { received.push(message); } }
  };
  const external = {
    getAttribute() { return "https://example.com/embed"; },
    addEventListener() { assert.fail("External frame should not be themed"); }
  };
  const view = page({ preferences: { canvasBackground: "#ffedf2", canvasThemeMode: "light" }, frames: [frame, external] });
  assert.equal(received[0].tokens["--cw-canvas-background"], "#ffedf2");
  frame.onload();
  assert.equal(received.length, 2);
  view.palette.applyTheme("#ffedf2", true, "dark");
  assert.equal(received.at(-1).tokens["--cw-canvas-background"], "#111923");
});

test("system mode resolves the current system appearance on each new page", () => {
  const view = page({ preferences: { canvasBackground: "#ffedf2", canvasThemeMode: "system" }, systemDark: true });
  assert.equal(view.color(), "#111923");
  const nextPage = page({ storage: view.storage, systemDark: false });
  assert.equal(nextPage.color(), "#ffedf2");
});

test("a theme change immediately becomes the next page's initial color", () => {
  const view = page({ preferences: { canvasBackground: "#ffedf2", canvasThemeMode: "light" } });
  view.palette.applyTheme("#123456", false, "light");
  assert.equal(page({ storage: view.storage }).color(), "#123456");
  view.palette.applyTheme("#123456", true, "dark");
  assert.equal(page({ storage: view.storage }).color(), "#111923");
});

test("slow or failed extension storage keeps the exact cached color", async () => {
  const view = page({ preferences: { canvasBackground: "#ffedf2", canvasThemeMode: "light" } });
  assert.equal(view.color(), "#ffedf2");
  view.rejectStorage(new Error("Unavailable"));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(view.color(), "#ffedf2");
});

test("first use and blocked site storage never substitute an arbitrary cover color", async () => {
  for (const blocked of [false, true]) {
    const view = page({ blocked });
    assert.equal(view.color(), undefined);
    assert.equal(view.document.documentElement.classes.size, 0);
    view.resolveStorage({ cwDataConsent: true, cwCanvasPreferences: { canvasBackground: "#ffedf2", canvasThemeMode: "light" } });
    await Promise.resolve();
    assert.equal(view.color(), "#ffedf2");
  }
});

test("invalid cached data is ignored and revoked consent clears the cached theme", async () => {
  const storage = new Map([[cacheKey, '{"canvasBackground":"invalid","canvasThemeMode":"light"}']]);
  assert.equal(page({ storage }).color(), undefined);
  const view = page({ preferences: { canvasBackground: "#ffedf2", canvasThemeMode: "light" } });
  view.insertBody();
  view.resolveStorage({ cwDataConsent: false });
  await Promise.resolve();
  assert.equal(view.storage.has(cacheKey), false);
  assert.equal(view.document.body.classes.has("cw-canvas-themed"), false);
  assert.equal(view.document.documentElement.classes.has("cw-canvas-themed"), false);
});
