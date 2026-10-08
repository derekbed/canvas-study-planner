import test from 'node:test';
import assert from 'node:assert/strict';
import '../chat-format.js';

const {parse, render} = globalThis.CoursewiseChatFormat;

test('formats a study plan with nested lists, emphasis, and emoji', () => {
  const blocks = parse('### Study plan 📚\n1. **Review readings**\n   - *Pan-Africanism*\n   - Write notes\n2. ~~Skip~~ Practice questions');
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[0].children[0].text, 'Study plan 📚');
  assert.equal(blocks[1].type, 'list');
  assert.equal(blocks[1].items.length, 2);
  assert.equal(blocks[1].items[0].children[0].type, 'strong');
  assert.equal(blocks[1].items[0].blocks[0].items[0].children[0].type, 'em');
  assert.equal(blocks[1].items[1].children[0].type, 'strike');
});

test('renders only safe links and treats HTML as text', () => {
  const doc = {
    createElement(tag) { return {tag, children: [], append(child) {this.children.push(child);}, set textContent(text) {this.children = [{text}];}}; },
    createTextNode(text) { return {text}; }
  };
  const result = render('[notes](https://example.com) [unsafe](javascript:alert(1)) <img src=x>\n\n```js\nconst n = 1;\n```', doc);
  const paragraph = result.children[0];
  assert.equal(paragraph.children[0].tag, 'a');
  assert.equal(paragraph.children[0].href, 'https://example.com');
  assert.equal(paragraph.children[0].rel, 'noopener noreferrer');
  assert.equal(paragraph.children.some(child => child.tag === 'img'), false);
  assert.equal(paragraph.children.some(child => child.tag === 'a' && child.href?.startsWith('javascript:')), false);
  assert.equal(result.children[1].tag, 'pre');
  assert.equal(result.children[1].children[0].children[0].text, 'const n = 1;');
});
