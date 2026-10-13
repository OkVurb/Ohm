const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

async function bootApp(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ohm-startup-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const handlers = new Map();
  const events = new Map();
  const windowEvents = new Map();
  const sent = [];
  let boot;
  let window;
  let response = 0;
  let followingResponses = [];
  let loaded;
  let quit = false;
  let selectedPath;
  let lastDialog;
  class BrowserWindow {
    constructor() {
      window = this;
      this.webContents = { setWindowOpenHandler() {}, on: (name, fn) => events.set(name, fn), send: name => sent.push(name) };
    }
    on(name, fn) { windowEvents.set(name, fn); }
    async loadFile(file) { loaded = file; }
    setAlwaysOnTop() {}
    isDestroyed() { return false; }
  }
  const electron = {
    app: {
      whenReady: () => ({ then(fn) { boot = fn(); return boot; } }),
      getPath: () => dir, on() {}, quit() { quit = true; },
      requestSingleInstanceLock: () => options.lock !== false
    },
    BrowserWindow,
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    dialog: {
      async showMessageBox(win, options) {
        assert.equal(win, window);
        assert.equal(options.defaultId, 0);
        assert.equal(options.cancelId, 0);
        lastDialog = options;
        const chosen = response;
        if (followingResponses.length) response = followingResponses.shift();
        return { response: chosen };
      },
      async showOpenDialog() { return { canceled: !selectedPath, filePaths: [selectedPath] }; }
    },
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
  if (options.lock === false) return { quit, loaded };
  assert.equal(quit, false, 'Unexpected startup failure');
  assert.equal(loaded, path.join(__dirname, '..', 'dist', 'index.html'));
  const event = { sender: window.webContents };
  return {
    dir, handlers, event, sent,
    closeBlocked() {
      let blocked = false;
      windowEvents.get('close')({ preventDefault() { blocked = true; } });
      return blocked;
    },
    crashRenderer() { events.get('render-process-gone')(); },
    invoke: (channel, ...args) => handlers.get(`ohm:${channel}`)(event, ...args),
    respond(value, ...following) { response = value; followingResponses = following; },
    select(value) { selectedPath = value; },
    get lastDialog() { return lastDialog; }
  };
}

test('main boots without a native backend, validates senders and serializes saves', async t => {
  const { dir, handlers, event, invoke } = await bootApp(t);
  const target = path.join(dir, 'workspace', 'ordered.lua');
  const save = handlers.get('ohm:save-file');
  await assert.rejects(save(event, 'invalid-path', 'bad'), /Invalid file path/);
  await Promise.all(Array.from({ length: 40 }, (_, i) => save(event, target, String(i))));
  assert.equal(await fs.readFile(target, 'utf8'), '39');
  const result = await invoke('launch-roblox-injector');
  assert.equal(result.success, false);
  assert.equal(result.code, 'BACKEND_UNAVAILABLE');
  await assert.rejects(handlers.get('ohm:init')({ sender: {} }), /Invalid window/);
});

test('another instance quits before touching the shared profile', async t => {
  const result = await bootApp(t, { lock: false });
  assert.equal(result.quit, true);
  assert.equal(result.loaded, undefined);
});

test('close cancellation, keep drafts and discard persist the explicit choice', async t => {
  const app = await bootApp(t);
  assert.equal(app.closeBlocked(), false, 'A failed startup must still be closable');
  await app.invoke('renderer-ready');
  assert.equal(app.closeBlocked(), true, 'A ready window waits for the renderer even without user activation');
  assert.deepEqual(app.sent, ['ohm:close-requested']);
  const snapshot = { version: 1, drafts: [{ id: 'one', name: 'draft.lua', content: 'unsaved text' }], activeId: 'one' };
  await app.invoke('save-recovery', snapshot);
  assert.equal(await app.invoke('prepare-close', snapshot), false);
  assert.equal(app.closeBlocked(), true);
  const file = path.join(app.dir, 'drafts.json');
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), snapshot);
  snapshot.drafts[0].content = 'newest text';
  app.respond(1);
  assert.equal(await app.invoke('prepare-close', snapshot), true);
  assert.equal(app.closeBlocked(), false);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), snapshot);
  app.respond(2);
  assert.equal(await app.invoke('prepare-close', snapshot), true);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')).drafts, []);
  await fs.unlink(file);
  await fs.mkdir(file);
  app.respond(1, 0);
  assert.equal(await app.invoke('prepare-close', snapshot), false);
  assert.equal(app.closeBlocked(), true, 'Failed persistence must not authorize closure');
  assert.equal(app.lastDialog.title, 'Draft recovery could not be saved');
  assert.equal((await fs.stat(file)).isDirectory(), true);
  app.respond(2, 1);
  assert.equal(await app.invoke('prepare-close', snapshot), true);
  assert.equal(app.closeBlocked(), false, 'An explicit close without recovery remains possible after a disk error');
  assert.equal((await fs.stat(file)).isDirectory(), true);
  app.respond(0);
  assert.equal(await app.invoke('prepare-close', snapshot), false);
  app.crashRenderer();
  assert.equal(app.closeBlocked(), false, 'A crashed renderer cannot complete a close handshake');
});

test('failed settings writes leave the live settings unchanged and queued patches compose', async t => {
  const app = await bootApp(t);
  const file = path.join(app.dir, 'settings.json');
  await fs.mkdir(file);
  await assert.rejects(app.invoke('set-settings', { theme: 'light' }));
  assert.equal((await app.invoke('get-settings')).theme, 'dark');
  await fs.rmdir(file);
  const results = await Promise.all([
    app.invoke('set-settings', { theme: 'light' }),
    app.invoke('set-settings', { fontSize: 18 }),
    app.invoke('set-topmost', true)
  ]);
  assert.equal(results[0].fontSize, 14);
  assert.equal(results[1].theme, 'light');
  assert.equal(results[1].fontSize, 18);
  assert.equal(results[2], true);
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(saved.theme, 'light');
  assert.equal(saved.fontSize, 18);
  assert.equal(saved.alwaysOnTop, true);
  assert.deepEqual(JSON.parse(JSON.stringify(await app.invoke('get-settings'))), saved);
  await assert.rejects(app.invoke('set-topmost', 'bad'), /Invalid setting/);
});

test('failed workspace persistence keeps the current workspace', async t => {
  const app = await bootApp(t);
  const original = (await app.invoke('init')).workspace;
  const chosen = path.join(app.dir, 'another-workspace');
  await fs.mkdir(chosen);
  await fs.mkdir(path.join(app.dir, 'workspace.json'));
  app.select(chosen);
  await assert.rejects(app.invoke('choose-workspace'));
  assert.equal((await app.invoke('init')).workspace, original);
});

test('autoexec supports save, open, cancel replacement and delete without accepting directories', async t => {
  const app = await bootApp(t);
  const folder = path.join(app.dir, 'autoexec');
  await fs.mkdir(path.join(folder, 'directory.lua'));
  await assert.rejects(app.invoke('save-autoexec', 'CON.lua', 'bad'), /reserved/);
  await assert.rejects(app.invoke('save-autoexec', '../escape.lua', 'bad'), /filename/);
  await assert.rejects(app.invoke('save-autoexec', 'directory.lua', 'bad'), /regular files/);
  assert.equal(await app.invoke('save-autoexec', 'test.luau', 'first'), 'test.luau');
  const names = await app.invoke('list-autoexec');
  assert.equal(names.length, 1);
  assert.equal(names[0], 'test.luau');
  const file = await app.invoke('read-autoexec', 'test.luau');
  assert.equal(file.content, 'first');
  assert.equal(await app.invoke('read-file', file.path), 'first');
  assert.equal(await app.invoke('save-autoexec', 'test.luau', 'cancelled'), null);
  assert.equal((await app.invoke('read-autoexec', 'test.luau')).content, 'first');
  app.respond(1);
  await app.invoke('save-autoexec', 'test.luau', 'replaced');
  assert.equal((await app.invoke('read-autoexec', 'test.luau')).content, 'replaced');
  await app.invoke('save-file', file.path, 'edited from tab');
  assert.equal((await app.invoke('read-autoexec', 'test.luau')).content, 'edited from tab');
  await app.invoke('delete-autoexec', 'test.luau');
  assert.equal((await app.invoke('list-autoexec')).length, 0);
});
