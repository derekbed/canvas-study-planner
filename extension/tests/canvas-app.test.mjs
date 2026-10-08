import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../canvas-app.js', import.meta.url), 'utf8');
const model = fs.readFileSync(new URL('../insights-model.js', import.meta.url), 'utf8');
function harness(favorites, fail = false, chromeRuntime = { id: 'test-extension', async sendMessage() { return { ok: true, data: {} }; } }) {
  const requests = [];
  const context = vm.createContext({
    location: { origin: 'https://canvas.upenn.edu', reload() {} },
    chrome: { runtime: chromeRuntime },
    window: { addEventListener() {} }, URL, AbortController, crypto, setTimeout, clearTimeout,
    async fetch(url) {
      requests.push(url.pathname);
      const isFavorites = url.pathname === '/api/v1/users/self/favorites/courses';
      return { ok: !(fail && isFavorites), headers: { get: key => key === 'content-type' ? 'application/json' : null },
        json: async () => isFavorites ? favorites : [] };
    }
  });
  vm.runInContext(model, context);
  // Expose the app's data layer before its DOM startup code runs.
  vm.runInContext(source.slice(0, source.indexOf('\n  navItem();')) +
    '\n render = () => {}; globalThis.app = { state, loadLive, courseList, broker, ask, loadCourseChats }; })();', context);
  return { app: context.app, requests };
}

test('course list contains dashboard favorites only, retaining saved customization', async () => {
  const { app, requests } = harness([{ id: 12, name: 'Canvas title', course_code: 'TEST' }]);
  app.state.workspace = { courses: [
    { id: 'saved', canvas_id: '12', name: 'Custom title', code: 'TEST', image_url: 'picture.png' },
    { id: 'old', canvas_id: '99', name: 'Old course', code: 'OLD' },
    { id: 'manual', name: 'Manual course', code: 'MANUAL' }
  ] };
  app.state.live = await app.loadLive();
  const courses = app.courseList();
  assert.equal(courses.length, 1);
  assert.equal(courses[0].name, 'Custom title');
  assert.equal(courses[0].saved.image_url, 'picture.png');
  assert.ok(requests.includes('/api/v1/users/self/favorites/courses'));
  assert.ok(!requests.includes('/api/v1/courses'));
  assert.ok(!requests.some(path => path.includes('/courses/99/')));
});

test('empty or failed favorites never repopulates the list from saved courses', async () => {
  for (const fail of [false, true]) {
    const { app } = harness([], fail);
    app.state.workspace = { courses: [{ id: 'saved', canvas_id: '99', name: 'Old course' }] };
    app.state.live = await app.loadLive();
    assert.equal(app.courseList().length, 0);
    assert.equal(app.state.live.errors.length > 0, fail);
  }
});

test('extension reloads show a refresh message instead of the raw Chrome error', async () => {
  const { app } = harness([], false, { id: 'test-extension', async sendMessage() { throw new Error('Extension context invalidated.'); } });
  let error;
  try { await app.broker('getWorkspace'); }
  catch (caught) { error = caught; }
  assert.equal(error?.message, 'Coursewise reloaded while this Canvas tab was open. Refresh Canvas, then reopen Coursewise.');
  assert.equal(error?.reconnect, true);
  assert.equal(app.state.extensionDisconnected, true);
});

test('successful replies remain visible when chat history and list refresh fail', async () => {
  let listAvailable = false, historyAvailable = false;
  const stored = [];
  const runtime = { id: 'test-extension', async sendMessage(message) {
    if (message.type === 'cw:manageChat') return { ok: true, data: { conversation: { id: 'chat-1', title: 'New conversation' } } };
    if (message.type === 'cw:askCoursewise') {
      const question = message.payload.question;
      stored.push({ id: `q-${stored.length}`, role: 'user', content: question },
        { id: `a-${stored.length}`, role: 'assistant', content: `Answer to ${question}`, sources: [] });
      return { ok: true, data: { answer: `Answer to ${question}`, sources: [] } };
    }
    if (message.type === 'cw:getChat') return historyAvailable ? { ok: true, data: { messages: stored, hasMore: false } } : { ok: false, error: { status: 503, message: 'History unavailable' } };
    if (message.type === 'cw:listChats') return listAvailable ? { ok: true, data: { conversations: [{ id: 'chat-1', title: 'First question' }] } } : { ok: false, error: { status: 503, message: 'List unavailable' } };
    throw new Error(`Unexpected ${message.type}`);
  } };
  const { app } = harness([], false, runtime);
  app.state.workspace = { courses: [{ id: 'course-1', canvas_id: '12', name: 'History', code: 'HIST' }], materials: [] };
  app.state.live.courses = [{ id: '12', name: 'History', code: 'HIST' }];
  app.state.courseId = app.state.chatCourse = 'course-1';
  app.state.question = 'First question'; await app.ask({ preventDefault() {} });
  assert.equal(app.state.chatMessages.length, 2);
  assert.equal(app.state.chatMessages[1].content, 'Answer to First question');
  assert.match(app.state.chatError, /refresh|load/i);
  app.state.question = 'Second question'; await app.ask({ preventDefault() {} });
  assert.equal(app.state.chatMessages.length, 4);
  assert.equal(app.state.question, '');
  listAvailable = historyAvailable = true;
  await app.loadCourseChats('course-1');
  assert.equal(app.state.chats.length, 1);
  assert.equal(app.state.chatMessages.length, 4);
});

test('a failed send retains the question for retry', async () => {
  const runtime = { id: 'test-extension', async sendMessage(message) {
    if (message.type === 'cw:manageChat') return { ok: true, data: { conversation: { id: 'chat-2', title: 'New conversation' } } };
    if (message.type === 'cw:askCoursewise') return { ok: false, error: { status: 503, message: 'AI unavailable' } };
    if (message.type === 'cw:getChat') return { ok: true, data: { messages: [], hasMore: false } };
    throw new Error(`Unexpected ${message.type}`);
  } };
  const { app } = harness([], false, runtime);
  app.state.workspace = { courses: [{ id: 'course-1', canvas_id: '12', name: 'History', code: 'HIST' }], materials: [] };
  app.state.live.courses = [{ id: '12', name: 'History', code: 'HIST' }];
  app.state.courseId = app.state.chatCourse = 'course-1'; app.state.question = 'Keep my question';
  await app.ask({ preventDefault() {} });
  assert.equal(app.state.question, 'Keep my question');
  assert.match(app.state.chatError, /AI unavailable/);
  assert.equal(app.state.chatMessages.length, 0);
});
