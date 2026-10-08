import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8');
function harness(initial = {}) {
  const data = structuredClone(initial);
  let listener;
  vm.runInNewContext(source, { chrome: {
    sidePanel: { setPanelBehavior() {} },
    runtime: { onMessage: { addListener(fn) { listener = fn; } } },
    storage: { local: {
      async get() { return structuredClone(data); },
      async set(value) { Object.assign(data, structuredClone(value)); },
      async remove(keys) { keys.forEach(key => delete data[key]); }
    } }
  }, Date });
  return (patch, type = 'cw:setPreferences') => new Promise(resolve => listener({ type, ...patch }, { tab: {}, url: 'https://canvas.upenn.edu/' }, resolve));
}
test('unpaired appearance changes persist and retain Match system', async () => {
  const send = harness({cwCanvasPreferences:{canvasBackground:'#10273d',canvasThemeMode:'system'}});
  assert.equal((await send({canvasBackground:'#f2f9f6'})).ok, true);
  const result = await send({}, 'cw:getPreferences');
  assert.equal(result.data.canvasBackground, '#f2f9f6');
  assert.equal(result.data.canvasThemeMode, 'system');
});
test('first use works unpaired and concurrent partial changes are preserved', async () => {
  const send = harness();
  const results = await Promise.all([send({canvasThemeMode:'system'}),send({canvasBackground:'#ffedf2'})]);
  assert.ok(results.every(result => result.ok));
  const result = await send({}, 'cw:getPreferences');
  assert.equal(result.data.canvasThemeMode, 'system');
  assert.equal(result.data.canvasBackground, '#ffedf2');
});
test('invalid appearance does not overwrite the saved choice', async () => {
  const send = harness({cwCanvasPreferences:{canvasBackground:'#f2f9f6',canvasThemeMode:'system'}});
  assert.equal((await send({canvasBackground:'invalid'})).ok, false);
  assert.equal((await send({}, 'cw:getPreferences')).data.canvasBackground, '#f2f9f6');
});
