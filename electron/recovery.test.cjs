const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { cleanRecovery, emptyRecovery, loadRecovery } = require('./recovery.cjs');
const { writeAtomic } = require('./storage.cjs');

const draft = { id: 'one', name: 'recovered.lua', content: 'print("draft")' };
const snapshot = () => ({ version: 1, drafts: [{ ...draft }], activeId: 'one' });

test('recovery round-trips content and selection without trusting saved file paths', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ohm-recovery-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'drafts.json');
  assert.deepEqual((await loadRecovery(file)).session, emptyRecovery());
  const input = snapshot();
  input.drafts[0].path = 'C:/somewhere/important.lua';
  const cleaned = cleanRecovery(input);
  assert.equal('path' in cleaned.drafts[0], false);
  await writeAtomic(file, JSON.stringify(cleaned));
  assert.deepEqual((await loadRecovery(file)).session, snapshot());
});

test('invalid recovery is preserved before a new session can replace it', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ohm-recovery-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'drafts.json');
  await fs.writeFile(file, '{partial draft');
  const result = await loadRecovery(file);
  assert.deepEqual(result.session, emptyRecovery());
  assert.match(result.warning, /preserved at/);
  const backup = (await fs.readdir(dir)).find(name => name.startsWith('drafts.json.corrupt-'));
  assert.ok(backup);
  assert.equal(await fs.readFile(path.join(dir, backup), 'utf8'), '{partial draft');
  await writeAtomic(file, JSON.stringify(snapshot()));
  assert.deepEqual((await loadRecovery(file)).session, snapshot());
  assert.equal(await fs.readFile(path.join(dir, backup), 'utf8'), '{partial draft');
});

test('invalid, duplicate, oversized and excessive drafts are rejected without truncation', () => {
  assert.throws(() => cleanRecovery({ version: 9, drafts: [] }));
  assert.throws(() => cleanRecovery({ ...snapshot(), drafts: [draft, draft] }));
  assert.throws(() => cleanRecovery({ ...snapshot(), drafts: [{ ...draft, content: 'a'.repeat(2 * 1024 * 1024 + 1) }] }));
  assert.throws(() => cleanRecovery({ ...snapshot(), drafts: Array.from({ length: 51 }, (_, i) => ({ ...draft, id: String(i) })) }));
  assert.throws(() => cleanRecovery({ ...snapshot(), drafts: Array.from({ length: 5 }, (_, i) => ({ ...draft, id: String(i), content: 'a'.repeat(2 * 1024 * 1024) })) }), /8 MB/);
  assert.equal(cleanRecovery({ ...snapshot(), activeId: 'unknown' }).activeId, null);
});
