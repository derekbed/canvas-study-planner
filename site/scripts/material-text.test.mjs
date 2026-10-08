import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../lib/material-text.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(`(function(module,exports){${compiled}\n})`, {})(module, module.exports);
const { scheduleWithColumns } = module.exports;
const cell = (text, x, y) => ({ text, x, y });

test('a two-column schedule keeps the date and activity together across pages', () => {
  const first = scheduleWithColumns([
    cell('Oct 19', 135, 130), cell('Oct 20', 290, 130),
    cell('Read FR 1-2', 114, 115), cell('PS 5 due', 286, 115),
    cell('Oct 26', 135, 100), cell('Oct 28', 290, 100),
  ], []);
  const second = scheduleWithColumns([
    cell('Read FR 3', 119, 710), cell('PS 6 due', 286, 710),
    cell('Nov 2', 137, 695), cell('Nov 4', 292, 695),
    cell('Read FR 4', 119, 680), cell('PS 7 due', 285, 680),
    cell('Nov 9', 137, 665), cell('Nov 11', 290, 665),
    cell('Midterm 2', 125, 650), cell('Read FR 5', 275, 650),
  ], first.pending);
  assert.match(second.text, /Oct 28: PS 6 due/);
  assert.match(second.text, /Nov 9: Midterm 2/);
  assert.doesNotMatch(second.text, /Nov 11: Midterm 2/);
});
