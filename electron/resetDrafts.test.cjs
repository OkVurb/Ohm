const test = require('node:test');
const assert = require('node:assert/strict');
const { resetDrafts } = require('./resetDrafts.cjs');

test('resetDrafts produces a fresh empty recovery snapshot', () => {
  const first = resetDrafts();
  assert.deepEqual(first, { version: 1, drafts: [], activeId: null });
  first.drafts.push({ id: 'later', name: 'later.lua', content: 'later' });
  assert.deepEqual(resetDrafts(), { version: 1, drafts: [], activeId: null });
});
