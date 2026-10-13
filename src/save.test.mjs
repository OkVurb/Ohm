import test from 'node:test';
import assert from 'node:assert/strict';
import { saveTab, hasUnsavedWork } from './save.mjs';

function fixture() {
  let content = 'original';
  let version = 1;
  const tab = { name: 'test.lua', path: null, dirty: true, model: {
    getValue: () => content, getVersionId: () => version
  } };
  return { tab, edit(value) { content = value; version++; tab.dirty = true; } };
}

test('edits made during a save remain dirty and repeated saves share a dialog', async () => {
  const { tab, edit } = fixture();
  let finish;
  let calls = 0;
  const api = { saveAs(name, content) {
    calls++;
    assert.equal(content, 'original');
    return new Promise(resolve => { finish = resolve; });
  } };
  const first = saveTab(tab, api);
  assert.equal(saveTab(tab, api), first);
  edit('newer edits');
  finish('saved.lua');
  assert.equal(await first, true);
  assert.equal(calls, 1);
  assert.equal(tab.dirty, true);
  assert.equal(tab.path, 'saved.lua');
  assert.equal(tab.saving, null);
  await saveTab(tab, { saveFile: async (path, content) => {
    assert.equal(content, 'newer edits');
    return path;
  } });
  assert.equal(tab.dirty, false);
});

test('cancelled or failed saves retain edits and permit retry', async () => {
  const { tab } = fixture();
  assert.equal(await saveTab(tab, { saveAs: async () => null }), false);
  assert.equal(tab.dirty, true);
  await assert.rejects(saveTab(tab, { saveAs: async () => { throw Error('disk full'); } }), /disk full/);
  assert.equal(tab.saving, null);
  assert.equal(tab.dirty, true);
  assert.equal(await saveTab(tab, { saveAs: async () => 'saved.lua' }), true);
  assert.equal(tab.dirty, false);
});

test('window close guard covers dirty tabs and saves still in progress', () => {
  assert.equal(hasUnsavedWork([]), false);
  assert.equal(hasUnsavedWork([{ dirty: false }]), false);
  assert.equal(hasUnsavedWork([{ dirty: true }]), true);
  assert.equal(hasUnsavedWork([{ dirty: false, saving: Promise.resolve() }]), true);
});
