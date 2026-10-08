import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const { extract, safeUrl } = require("../content.js");
const fixture = name => fs.readFileSync(path.join(import.meta.dirname, "../fixtures", name), "utf8");

// Small fixture DOM for the selectors used here. Browser behavior is checked separately in Chrome.
function documentFor(html) {
  const nodes = [];
  const pattern = /<\/?([a-z][\w-]*)\b([^>]*)>/gi;
  for (const match of html.matchAll(pattern)) {
    if (match[0].startsWith("</")) continue;
    const tag = match[1], attrs = match[2], start = match.index + match[0].length;
    const end = html.indexOf(`</${tag}>`, start);
    const inner = end < 0 ? "" : html.slice(start, end);
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1] || "";
    const cls = /\bclass="([^"]+)"/.exec(attrs)?.[1] || "";
    const href = /\bhref="([^"]+)"/.exec(attrs)?.[1] || "";
    nodes.push({ tag, id, cls, href, inner });
  }
  const doc = { querySelectorAll(selector) {
    const simple = selector.split(" ").at(-1);
    return nodes.filter(n => simple === n.tag || simple === `#${n.id}` || simple === `.${n.cls}` ||
      (simple === "a[href*='/courses/']" && n.tag === "a" && n.href.includes("/courses/")))
      .map(n => ({ ownerDocument: doc, closest: () => null, nodeType: 1, parentElement: null,
        html: n.inner }));
  }, createTreeWalker(node) {
    const texts = [], stack = [node];
    for (const token of node.html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith("</")) { if (stack.length > 1) stack.pop(); continue; }
      if (token.startsWith("<")) {
        const tag = /^<([a-z][\w-]*)/i.exec(token)?.[1]?.toLowerCase() || "";
        const blocked = /\shidden(?:\s|>|=)|aria-hidden=['"]true['"]/.test(token) || ["script", "style", "noscript", "template", "input", "textarea"].includes(tag);
        const parentElement = stack.at(-1);
        const element = { nodeType: 1, parentElement, closest: () => blocked ? element : parentElement.closest() };
        if (!token.endsWith("/>")) stack.push(element);
      } else texts.push({ nodeValue: token, parentElement: stack.at(-1) });
    }
    let index = 0; return { nextNode() { return texts[index++] || null; } };
  } };
  return doc;
}
const win = { getComputedStyle: () => ({ display: "block", visibility: "visible" }) };
test("unpacked manifest has a stable ID matching the local API allowlist", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../manifest.json"), "utf8"));
  const digest = createHash("sha256").update(Buffer.from(manifest.key, "base64")).digest().subarray(0, 16);
  const id = [...digest].flatMap(byte => [byte >> 4, byte & 15]).map(nibble => String.fromCharCode(97 + nibble)).join("");
  assert.equal(id, "fjflmeaiboafcffacfmlaopangaedjho");
  assert.equal(manifest.side_panel.default_path, "sidepanel.html");
});
test("assignment and course fixtures expose sanitized visible fields", () => {
  const assignment = extract(documentFor(fixture("assignment.html")), win, "https://canvas.upenn.edu/courses/123/assignments/456?secret=discard");
  assert.equal(assignment.supported, true);
  assert.equal(assignment.context.assignmentTitle, "Problem Set 4");
  assert.equal(assignment.context.courseName, "Physics");
  assert.equal(assignment.context.dueText, "Due Oct 14 at 11:59 PM");
  assert.equal(assignment.context.pointsText, "100 points");
  assert.equal(assignment.context.url, "https://canvas.upenn.edu/courses/123/assignments/456");
  assert.ok(!assignment.context.instructions.includes("HIDDEN TEXT"));
  const course = extract(documentFor(fixture("course.html")), win, "https://canvas.upenn.edu/courses/123");
  assert.equal(course.context.courseCode, "PHYS 1230");
  assert.equal(course.context.assignmentTitle, "");
});
test("calendar, dashboard and private feeds do not yield page context", () => {
  assert.equal(extract(documentFor(fixture("calendar.html")), win, "https://canvas.upenn.edu/calendar").supported, false);
  assert.equal(extract(documentFor(fixture("unsupported.html")), win, "https://canvas.upenn.edu/").message, "No Canvas context detected");
  assert.equal(safeUrl("https://canvas.upenn.edu/feeds/calendars/private.ics?token=redacted"), "");
});
test("instructions are capped at 8,000 characters", () => {
  const long = '<div class="description">' + "a".repeat(9000) + "</div>";
  const result = extract(documentFor(long), win, "https://canvas.upenn.edu/courses/123/assignments/456");
  assert.equal(result.context.instructions.length, 8000);
});
