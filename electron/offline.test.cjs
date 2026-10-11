const assert = require('node:assert/strict');
const path = require('node:path');
const { runOffline } = require('./offline.cjs');

const executable = path.join(__dirname, '..', 'vendor', 'luau', 'luau.exe');

(async () => {
  const success = await runOffline('print(6 * 7)', executable);
  assert.equal(success.ok, true);
  assert.equal(success.stdout.trim(), '42');

  const failure = await runOffline('local =', executable);
  assert.equal(failure.ok, false);
  assert.match(failure.stderr, /syntax|expected|error/i);
  console.log('Offline Luau checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
