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

test('recovery retries failed checkpoints while idle using the latest buffer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let fail = true;
  let text = 'first';
  let attempts = 0;
  const writes = [];
  const recovery = createDraftRecovery({ retryDelay: 2000, snapshot: () => text, save: async value => {
    attempts++;
    if (fail) throw new Error('temporarily unwritable');
    writes.push(value);
  } });
  t.after(() => recovery.pause());
  recovery.schedule();
  await assert.rejects(recovery.flush(), /temporarily unwritable/);
  text = 'latest';
  fail = false;
  t.mock.timers.tick(1999);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 1);
  t.mock.timers.tick(1);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(writes, ['latest']);
  assert.equal(recovery.pending, false);
});

test('pausing cancels scheduled retries and failures settling during pause do not restart them', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let attempts = 0;
  let rejectWrite;
  const recovery = createDraftRecovery({ retryDelay: 2000, snapshot: () => 'draft', save: () => {
    attempts++;
    return new Promise((resolve, reject) => { rejectWrite = reject; });
  } });
  recovery.schedule();
  const flush = recovery.flush();
  await Promise.resolve();
  rejectWrite(new Error('disk full'));
  await assert.rejects(flush, /disk full/);
  await recovery.pause();
  t.mock.timers.tick(3000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 1);
  recovery.resume();
  const second = recovery.flush();
  await Promise.resolve();
  const paused = recovery.pause();
  rejectWrite(new Error('still full'));
  await assert.rejects(second, /still full/);
  await paused;
  t.mock.timers.tick(3000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 2);
  assert.equal(recovery.pending, true);
});
