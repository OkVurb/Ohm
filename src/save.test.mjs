import test from 'node:test';
import assert from 'node:assert/strict';
import { saveTab, hasUnsavedWork, refreshReplacedTabs } from './save.mjs';

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

test('replacing a file refreshes matching clean tabs without touching other tabs', () => {
  let value = 'old';
  const tab = { path: 'C:\\Autoexec\\A.lua', dirty: false, model: {
    getValue: () => value,
    setValue(next) { value = next; tab.dirty = true; }
  } };
  const other = { path: 'C:/Autoexec/b.lua', dirty: false };
  assert.deepEqual(refreshReplacedTabs([tab, other], { path: 'c:/autoexec/a.lua', content: 'replacement' }, 'win32'), []);
  assert.equal(value, 'replacement');
  assert.equal(tab.dirty, false);
  assert.equal(tab.path, 'C:\\Autoexec\\A.lua');
  assert.equal(other.dirty, false);
});

test('replacement preserves dirty buffers and an older pending save cannot reattach them', async () => {
  const { tab, edit } = fixture();
  tab.path = 'C:/Autoexec/a.lua';
  let finish;
  const saving = saveTab(tab, { saveFile: () => new Promise(resolve => { finish = resolve; }) });
  edit('unsaved edits');
  const protectedTabs = refreshReplacedTabs([tab], { path: 'C:/Autoexec/a.lua', content: 'replacement' }, 'win32');
  assert.deepEqual(protectedTabs, [tab]);
  assert.equal(tab.model.getValue(), 'unsaved edits');
  assert.equal(tab.path, null);
  assert.equal(tab.name, 'a.lua');
  finish('C:/Autoexec/a.lua');
  await saving;
  assert.equal(tab.path, null);
  assert.equal(tab.dirty, true);
  let saveAsCalled = false;
  await saveTab(tab, { saveAs: async (name, content) => {
    saveAsCalled = true;
    assert.equal(content, 'unsaved edits');
    return null;
  } });
  assert.equal(saveAsCalled, true);
  assert.equal(tab.dirty, true);
});
