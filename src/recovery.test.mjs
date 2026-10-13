import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftRecovery, snapshotDrafts } from './recovery.mjs';

test('only unsaved contents are recovered and active selection has no file-write permission', () => {
  const dirty = { id: 'one', path: 'C:\\work\\draft.lua', dirty: true, model: { getValue: () => 'edited' } };
  const clean = { id: 'two', path: 'C:\\work\\clean.lua', dirty: false, model: { getValue() { throw new Error('Should not read clean model'); } } };
  assert.deepEqual(snapshotDrafts([dirty, clean], dirty.id), {
    version: 1, drafts: [{ id: 'one', name: 'draft.lua', content: 'edited' }], activeId: 'one'
  });
  assert.equal(snapshotDrafts([dirty, clean], clean.id).activeId, null);
});

test('changes made during recovery writing are persisted after the older snapshot', async t => {
  let value = 'old';
  const writes = [];
  let release;
  const started = new Promise(resolve => { release = resolve; });
  let finish;
  const recovery = createDraftRecovery({ delay: 10000, snapshot: () => value, save: async snapshot => {
    writes.push(snapshot);
    if (writes.length === 1) { release(); await new Promise(resolve => { finish = resolve; }); }
  } });
  t.after(() => recovery.pause());
  recovery.schedule();
  const flushing = recovery.flush();
  await started;
  value = 'new';
  recovery.schedule();
  finish();
  await flushing;
  assert.deepEqual(writes, ['old', 'new']);
  assert.equal(recovery.pending, false);
});

test('failed recovery stays pending and can retry without losing the current text', async t => {
  let fail = true;
  let value = 'first';
  const writes = [];
  const recovery = createDraftRecovery({ delay: 10000, snapshot: () => value, save: async snapshot => {
    if (fail) throw new Error('disk full');
    writes.push(snapshot);
  } });
  t.after(() => recovery.pause());
  recovery.schedule();
  await assert.rejects(recovery.flush(), /disk full/);
  assert.equal(recovery.pending, true);
  fail = false;
  value = 'latest';
  await recovery.flush();
  assert.deepEqual(writes, ['latest']);
  assert.equal(recovery.pending, false);
});

test('pausing for close prevents queued snapshots from overwriting the close decision', async () => {
  let finish;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const writes = [];
  const recovery = createDraftRecovery({ delay: 10000, snapshot: () => writes.length, save: async value => {
    writes.push(value);
    started();
    await new Promise(resolve => { finish = resolve; });
  } });
  recovery.schedule();
  const first = recovery.flush();
  await ready;
  recovery.schedule();
  const waiting = recovery.flush();
  const paused = recovery.pause();
  finish();
  await Promise.all([first, waiting, paused]);
  assert.deepEqual(writes, [0]);
  assert.equal(recovery.pending, true);
});
