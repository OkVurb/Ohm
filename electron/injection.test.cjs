const test = require('node:test');
const assert = require('node:assert/strict');
const bridge = require('./injection.js');
const { RobloxInjector } = require('../src/injector/injection.js');

test('bridge loads without browser globals and reports the missing backend', async () => {
  assert.equal(bridge.status().available, false);
  const result = await bridge.inject(123, 'example.dll', false);
  assert.equal(result.success, false);
  assert.match(result.error, /backend/);
  assert.deepEqual(bridge.list(), []);
  assert.equal(await bridge.uninject(123), false);
  for (const method of ['injectFromDirectory', 'injectFromDllDirectory']) {
    const result = await bridge[method]('unused-directory');
    assert.equal(result.success, false);
    assert.equal(result.code, 'BACKEND_UNAVAILABLE');
  }
});

test('backend rejection cannot become successful attachment or removal', async () => {
  const injector = new RobloxInjector();
  injector.api = {
    injectRoblox: async () => ({ success: false, error: 'Unavailable' }),
    uninjectRoblox: async () => ({ success: false })
  };
  const result = await injector.inject(123, 'example.dll', false);
  assert.equal(result.success, false);
  assert.equal(result.error, 'Unavailable');
  assert.deepEqual(injector.list(), []);
  injector.injected.set(123, { pid: 123, dll: 'example.dll' });
  assert.equal(await injector.unload(123), false);
  assert.equal(injector.list()[0].pid, 123);
});

test('both bridge modules are included in the packaged application', () => {
  const { build } = require('../package.json');
  assert.ok(build.files.includes('electron/injection.js'));
  assert.ok(build.files.includes('src/injector/injection.js'));
});
