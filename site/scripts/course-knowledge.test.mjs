import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = fs.readFileSync(path.join(import.meta.dirname, "../lib/course-knowledge.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${code}\n})`) (
  name => name === "./server" ? {} : require(name), module, module.exports
);
const { briefFor, gapsFor } = module.exports;
const fact = (key, value) => ({ key, value, sourceLabel: "Syllabus, page 1", sourceMaterialId: "file", origin: "syllabus", confidence: "high", updatedAt: "2026-10-07" });

test("course overview stays short and does not repeat detailed grading or exam facts", () => {
  const facts = [
    fact("course_overview", "Surveys the art, politics, and societies of the ancient Mediterranean world."),
    fact("course_topics", "Egypt; Mesopotamia; Greece; Rome"),
    fact("instructor_contact", "Professor Jane Smith; jane@example.edu; office 204"),
    fact("exam_dates", "Midterm October 20; final December 10"),
    fact("grading_weights", "Exams 50%; projects 35%; attendance 15%"),
  ];
  const brief = briefFor({ name: "Ancient History", code: "HIST 101" }, facts);
  assert.match(brief, /Surveys the art, politics, and societies/);
  assert.match(brief, /Instructor: Jane Smith/);
  assert.doesNotMatch(brief, /December 10|50%|jane@example.edu|Egypt; Mesopotamia/);
  assert.ok(brief.length < 250);
});

test("older syllabus facts still yield a concise overview without requesting a second overview", () => {
  const facts = [fact("course_topics", "Linear algebra; eigenvalues; matrix methods"), fact("instructor_contact", "Dr. Lee; lee@example.edu")];
  assert.match(briefFor({ name: "Math", code: "" }, facts), /Linear algebra/);
  assert.equal(gapsFor(facts).some(gap => gap.key === "course_overview"), false);
});
