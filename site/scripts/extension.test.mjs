import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
const require = createRequire(import.meta.url), ts = require("typescript"), root = path.resolve(import.meta.dirname, "..");
const sql = new DatabaseSync(":memory:");
for (const file of fs.readdirSync(path.join(root, "drizzle")).filter(name => name.endsWith(".sql")).sort())
  sql.exec(fs.readFileSync(path.join(root, "drizzle", file), "utf8"));
const db = { prepare(query) { let args = []; return {
  bind(...values) { args = values; return this; },
  async first() { return sql.prepare(query).get(...args) || null; },
  async all() { return { results: sql.prepare(query).all(...args) }; },
  async run() { const result = sql.prepare(query).run(...args); return { meta: { changes: result.changes } }; }
}; }, async batch(statements) { for (const statement of statements) await statement.run(); } };
const env = { DB: db }, modules = new Map();
function load(filename) { filename = path.resolve(root, filename); if (!path.extname(filename)) filename += ".ts";
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} }; modules.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(`(function(require,module,exports){${source}\n})`, { filename }).runInThisContext()((name) =>
    name === "cloudflare:workers" ? { env } : name.startsWith("@/") ? load(name.slice(2)) : name.startsWith(".") ? load(path.resolve(path.dirname(filename), name)) : require(name), module, module.exports);
  return module.exports;
}
const start = load("app/api/extension/pair/start/route.ts"), confirm = load("app/api/extension/pair/confirm/route.ts"),
  complete = load("app/api/extension/pair/complete/route.ts"), study = load("app/api/extension/study/route.ts"),
  session = load("app/api/extension/session/route.ts"), course = load("app/api/extension/course/route.ts"),
  validation = load("lib/extension-study.ts");
const origin = "chrome-extension://fjflmeaiboafcffacfmlaopangaedjho";
const request = (path, body = {}, headers = {}) => new Request("http://localhost:5173" + path, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...headers }, body: JSON.stringify(body)
});
async function pair(user) {
  const started = await start.POST(request("/api/extension/pair/start")); assert.equal(started.status, 200);
  const { code } = await started.json();
  const approved = await confirm.POST(request("/api/extension/pair/confirm", { code }, { Origin: "http://localhost:5173", "oai-authenticated-user-id": user }));
  assert.equal(approved.status, 200);
  const finished = await complete.POST(request("/api/extension/pair/complete", { code })); assert.equal(finished.status, 200);
  return (await finished.json()).token;
}
test("request limits reject oversized fields and private feed URLs", () => {
  assert.equal(validation.validateStudyBody(JSON.stringify({ question: "x", canvasContext: { instructions: "a".repeat(8001) } })), null);
  assert.equal(validation.validateStudyBody(JSON.stringify({ question: "x", canvasContext: { url: "https://canvas.upenn.edu/feeds/calendars/secret.ics" } })), null);
  assert.equal(validation.validateStudyBody(JSON.stringify({ question: "x", canvasContext: { pageTitle: "safe" } })).canvasContext.pageTitle, "safe");
});
test("pairing requires signed-in confirmation and tokens expire or revoke", async () => {
  const started = await start.POST(request("/api/extension/pair/start")), { code } = await started.json();
  assert.equal((await complete.POST(request("/api/extension/pair/complete", { code }))).status, 409);
  assert.equal((await confirm.POST(request("/api/extension/pair/confirm", { code }, { Origin: "http://localhost:5173" }))).status, 401);
  assert.equal((await study.POST(request("/api/extension/study", { question: "Hi", canvasContext: {} }))).status, 401);
  const token = await pair("student-a"), hash = await load("lib/extension.ts").hashSecret(token);
  assert.equal((await session.POST(request("/api/extension/session", {}, { Authorization: `Bearer ${token}` }))).status, 200);
  assert.equal(sql.prepare("SELECT revoked FROM extension_sessions WHERE token_hash=?").get(hash).revoked, 1);
  assert.equal((await study.POST(request("/api/extension/study", { question: "Hi", canvasContext: {} }, { Authorization: `Bearer ${token}` }))).status, 401);
  const another = await pair("student-a");
  sql.prepare("UPDATE extension_sessions SET expires_at=0 WHERE token_hash=?").run(await load("lib/extension.ts").hashSecret(another));
  assert.equal((await study.POST(request("/api/extension/study", { question: "Hi", canvasContext: {} }, { Authorization: `Bearer ${another}` }))).status, 401);
});
test("course pictures save with the existing teal color", async () => {
  const token = await pair("student-picture");
  sql.prepare("INSERT INTO courses (id,user_id,canvas_id,name,code,color,target_grade,grade_weights,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("student-picture-course", "student-picture", "321", "Ancient History", "MELC 0001", "teal", 90, "{}", "extension", "2026-10-07");
  const imageUrl = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");
  const response = await course.POST(request("/api/extension/course", {
    action: "style", courseId: "student-picture-course", color: "teal", imageUrl
  }, { Authorization: `Bearer ${token}` }));
  assert.equal(response.status, 200);
  const saved = sql.prepare("SELECT color,image_url FROM courses WHERE id=?").get("student-picture-course");
  assert.equal(saved.color, "teal");
  assert.equal(saved.image_url, imageUrl);
});
test("study uses only the paired account's saved materials and consent", async () => {
  const token = await pair("student-a");
  for (const user of ["student-a", "student-b"]) {
    sql.prepare("INSERT INTO preferences (user_id,value) VALUES (?,?)").run(user, '{"consent":true}');
    sql.prepare("INSERT INTO courses (id,user_id,canvas_id,name,code,color,target_grade,grade_weights,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(`${user}-course`, user, "123", "Physics", "PHYS 1230", "blue", 90, "{}", "manual", "2026-10-01");
    sql.prepare("INSERT INTO materials (id,user_id,course_id,name,kind,mime_type,extracted_text,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(`${user}-material`, user, `${user}-course`, "Notes.txt", "notes", "text/plain", user === "student-a" ? "Owner-only momentum notes" : "OTHER_ACCOUNT_SECRET", "2026-10-01");
  }
  env.OPENAI_API_KEY = "test-only-key";
  const originalFetch = globalThis.fetch; let sent;
  globalThis.fetch = async (_url, options) => { sent = JSON.parse(options.body); return Response.json({ output: [{ content: [{ type: "output_text", text: "Review momentum." }] }] }); };
  try {
    const response = await study.POST(request("/api/extension/study", { question: "Review momentum", canvasContext: { url: "https://canvas.upenn.edu/courses/123/assignments/456", assignmentTitle: "Problem Set" } },
      { Authorization: `Bearer ${token}`, "oai-authenticated-user-id": "student-b" }));
    assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.answer, "Review momentum.");
    assert.ok(result.sources.includes("Notes.txt, section 1"));
    assert.ok(sent.input.includes("Owner-only momentum notes"));
    assert.ok(!sent.input.includes("OTHER_ACCOUNT_SECRET"));
    assert.ok(!JSON.stringify(result).includes("test-only-key"));
    assert.equal(sql.prepare("SELECT user_id FROM chat_messages ORDER BY created_at DESC LIMIT 1").get().user_id, "student-a");
    const tooLarge = await study.POST(request("/api/extension/study", { question: "x", canvasContext: { instructions: "a".repeat(8001) } }, { Authorization: `Bearer ${token}` }));
    assert.equal(tooLarge.status, 413);
  } finally { globalThis.fetch = originalFetch; delete env.OPENAI_API_KEY; }
});
test("missing consent, missing AI service, and other extension origins fail clearly", async () => {
  const token = await pair("student-c");
  const body = { question: "Help me study", canvasContext: { pageTitle: "Course home" } };
  const headers = { Authorization: `Bearer ${token}` };
  assert.equal((await study.POST(request("/api/extension/study", body, headers))).status, 503);
  env.OPENAI_API_KEY = "test-only-key";
  try {
    assert.equal((await study.POST(request("/api/extension/study", body, headers))).status, 403);
    assert.equal((await start.POST(request("/api/extension/pair/start", {}, { Origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }))).status, 403);
  } finally { delete env.OPENAI_API_KEY; }
});
