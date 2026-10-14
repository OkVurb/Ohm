const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { writeAtomic } = require('./storage.cjs');

test('overlapping saves all succeed and the last submitted value wins', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ohm-storage-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'script.lua');
  await Promise.all(Array.from({ length: 40 }, (_, i) => writeAtomic(file, `print(${i})`)));
  assert.equal(await fs.readFile(file, 'utf8'), 'print(39)');
  assert.deepEqual(await fs.readdir(dir), ['script.lua']);
});

test('failed replacement preserves destination, cleans temp files and allows retry', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ohm-storage-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const target = path.join(dir, 'blocked');
  await fs.mkdir(target);
  await assert.rejects(writeAtomic(target, 'first'));
  assert.deepEqual(await fs.readdir(dir), ['blocked']);
  await fs.rmdir(target);
  await writeAtomic(target, 'retry');
  assert.equal(await fs.readFile(target, 'utf8'), 'retry');
});
