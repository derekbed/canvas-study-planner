import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('syllabus upload uses JSON so extension requests reach the local API route', async () => {
  const source = fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8');
  let listener, request;
  const storage = { cwDataConsent: true, extensionToken: 'a'.repeat(48), expiresAt: Date.now() + 60_000 };
  const context = { chrome: {
    sidePanel: { setPanelBehavior() {} },
    runtime: { onMessage: { addListener(fn) { listener = fn; } } },
    storage: { local: { async get() { return storage; }, async remove() {} },
      session: { async get() { return storage; }, async remove() {} } },
  }, FormData, Uint8Array, atob,
  async fetch(_url, options) { request = options; return { ok: true, json: async () => ({ indexed: true }) }; } };
  vm.runInNewContext(source, context);
  const content = Buffer.from('synthetic course outline');
  const result = await new Promise(resolve => listener({ type: 'cw:uploadMaterial', courseId: 'physics', kind: 'syllabus',
    file: { name: 'syllabus.txt', type: 'text/plain', size: content.length, base64: content.toString('base64') } },
    { tab: {}, url: 'https://canvas.upenn.edu/' }, resolve));
  assert.equal(result.ok, true);
  assert.equal(request.headers['Content-Type'], 'application/json');
  assert.equal(JSON.parse(request.body).file.base64, content.toString('base64'));
  assert.equal(JSON.parse(request.body).courseId, 'physics');
});
