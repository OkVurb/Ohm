const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

test('main boots without a native backend and close confirmation defaults to keeping edits', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ohm-startup-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const handlers = new Map();
  const events = new Map();
  let boot;
  let window;
  let response = 0;
  let loaded;
  class BrowserWindow {
    constructor() {
      window = this;
      this.webContents = { setWindowOpenHandler() {}, on: (name, fn) => events.set(name, fn) };
    }
    async loadFile(file) { loaded = file; }
    setAlwaysOnTop() {}
  }
  const electron = {
    app: {
      whenReady: () => ({ then(fn) { boot = fn(); return boot; } }),
      getPath: () => dir, on() {}, quit() { assert.fail('Unexpected startup failure'); }
    },
    BrowserWindow,
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    dialog: { showMessageBoxSync(win, options) {
      assert.equal(win, window);
      assert.equal(options.defaultId, 0);
      assert.equal(options.cancelId, 0);
      return response;
    } },
    shell: {}
  };
  const localRequire = createRequire(path.join(__dirname, 'main.cjs'));
  const config = localRequire('../package.json');
  vm.runInNewContext(await fs.readFile(path.join(__dirname, 'main.cjs'), 'utf8'), {
    require(name) {
      if (name === 'electron') return electron;
      if (name.startsWith('./')) {
        const resolved = localRequire.resolve(name);
        assert.ok(config.build.files.includes(`electron/${path.basename(resolved)}`), `${name} missing from package`);
      }
      return localRequire(name);
    },
    __dirname, process, Buffer, console
  });
  await boot;
  assert.equal(loaded, path.join(__dirname, '..', 'dist', 'index.html'));
  const event = { sender: window.webContents };
  const target = path.join(dir, 'workspace', 'ordered.lua');
  const save = handlers.get('ohm:save-file');
  await assert.rejects(save(event, 'invalid-path', 'bad'), /Invalid file path/);
  await Promise.all(Array.from({ length: 40 }, (_, i) => save(event, target, String(i))));
  assert.equal(await fs.readFile(target, 'utf8'), '39');
  const result = await handlers.get('ohm:launch-roblox-injector')(event);
  assert.equal(result.success, false);
  assert.equal(result.code, 'BACKEND_UNAVAILABLE');
  await assert.rejects(handlers.get('ohm:init')({ sender: {} }), /Invalid window/);
  let allowed = false;
  events.get('will-prevent-unload')({ preventDefault() { allowed = true; } });
  assert.equal(allowed, false);
  response = 1;
  events.get('will-prevent-unload')({ preventDefault() { allowed = true; } });
  assert.equal(allowed, true);
});
