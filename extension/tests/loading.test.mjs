import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../insights.js', import.meta.url), 'utf8');
const loadSource = source.slice(source.indexOf('  async function load() {'), source.indexOf('  function showCardGrades()'));

function harness(overrides = {}) {
  const state = {
    loading: false, generation: 0, workspace: null,
    ...Object.fromEntries(['courses', 'work', 'announcements', 'syncTimes', 'healthCache', 'errors'].map(key => [key, new Map()])),
    requested: new Set(),
  };
  const context = {
    state, route: () => ({ type: 'dashboard' }), render() {},
    apiPages: async () => [], visibleIds: () => [],
    broker: async () => null, placeholder: id => ({ id }),
    model: { courseFor: row => row, courseId: String, withEnrollmentGrade: course => course },
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext(`${loadSource}\nthis.load = load;`, context);
  return context;
}

test('course and enrollment requests start together and blocked summaries remain optional', async () => {
  const calls = [];
  let resolveCourses;
  const context = harness({
    apiPages(path) {
      calls.push(path);
      if (path.endsWith('/courses')) return new Promise(resolve => { resolveCourses = resolve; });
      return Promise.reject(new Error('School blocked summaries'));
    },
  });
  const pending = context.load();
  assert.deepEqual(calls, ['/api/v1/courses', '/api/v1/users/self/enrollments']);
  resolveCourses([{ id: '42', name: 'Biology' }]);
  await pending;
  assert.equal(context.state.courses.get('42').name, 'Biology');
  assert.equal(context.state.errors.size, 0);
  assert.equal(context.state.loading, false);
});

test('navigation during workspace retrieval cannot overwrite the new route', async () => {
  let resolveWorkspace;
  let workspaceStarted;
  const started = new Promise(resolve => { workspaceStarted = resolve; });
  const context = harness({
    broker(action) {
      if (action !== 'getWorkspace') return Promise.resolve();
      workspaceStarted();
      return new Promise(resolve => { resolveWorkspace = resolve; });
    },
  });
  const pending = context.load();
  await started;
  context.state.generation++;
  context.state.workspace = { current: true };
  resolveWorkspace({ stale: true });
  await pending;
  assert.deepEqual(context.state.workspace, { current: true });
});
