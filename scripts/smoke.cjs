const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const executable = path.resolve(process.argv[2] || 'release/reliability-check/win-unpacked/Ohm.exe');
const output = path.resolve('release/reliability-verification');

async function waitFor(check, description, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await check()) return;
    await pause(100);
  }
  throw new Error(`Timed out: ${description}`);
}

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function connect(url, exceptions) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  let closed = false;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    closed = true;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Debug session closed')); }
    pending.clear();
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Timed out: ${method}`)); }, 15000);
    pending.set(requestId, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  return {
    call,
    get closed() { return closed; },
    close: () => socket.close(),
    async evaluate(expression) {
      const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
        .catch(error => { throw new Error(`Evaluation failed: ${expression.slice(0, 100)}`, { cause: error }); });
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    }
  };
}

async function launch(profile, number, exceptions) {
  const port = await freePort();
  let mainPort = await freePort();
  while (mainPort === port) mainPort = await freePort();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, [
    `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
    `--inspect=127.0.0.1:${mainPort}`, `--user-data-dir=${profile}`,
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows'
  ], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  child.on('error', error => { log += error.stack; });
  let renderer;
  let main;
  const stop = async () => {
    renderer?.close();
    main?.close();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await waitFor(() => child.exitCode !== null || child.signalCode !== null, 'test app to exit');
    }
    await fs.writeFile(path.join(output, `process-${number}.log`), log);
  };
  try {
    let page;
    let backend;
    await waitFor(async () => {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`App exited early: ${log}`);
      try {
        page = (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(item => item.type === 'page' && item.url.startsWith('file:'));
        backend = (await fetch(`http://127.0.0.1:${mainPort}/json/list`).then(r => r.json()))[0];
      } catch { return false; }
      return page && backend;
    }, 'packaged app debugger', 60000);
    renderer = await connect(page.webSocketDebuggerUrl, exceptions);
    main = await connect(backend.webSocketDebuggerUrl, exceptions);
    await renderer.call('Runtime.enable');
    await waitFor(() => renderer.evaluate("document.querySelector('#messages')?.innerText.includes('Ohm is ready.')"), 'renderer startup');
    // Only the isolated test process gets simulated native dialog responses.
    // Actual native close events, renderer IPC, disk writes and window closure still run.
    await main.evaluate(`globalThis.__ohmSmokeResponse = 0;
      globalThis.__ohmSmokeDialogs = 0;
      process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false);
      process.mainModule.require('electron').dialog.showMessageBox = async () => {
        globalThis.__ohmSmokeDialogs++;
        return { response: globalThis.__ohmSmokeResponse };
      }; true`);
    await main.evaluate(`{
      const window = process.mainModule.require('electron').BrowserWindow.getAllWindows()[0];
      window.on('close', event => process.stdout.write('SMOKE CLOSE: ' + event.defaultPrevented + '\\n'));
      window.webContents.on('render-process-gone', (_event, details) => process.stdout.write('SMOKE RENDERER GONE: ' + JSON.stringify(details) + '\\n'));
    }`);
    return {
      renderer, main, stop,
      wait: expression => waitFor(() => renderer.evaluate(expression), expression),
      requestClose: () => main.evaluate("setTimeout(() => process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].close(), 50); true"),
      async exited() {
        await waitFor(() => renderer.closed, 'window closure');
        // Node's inspector holds process exit until its debugger detaches.
        main.close();
        await waitFor(() => child.exitCode !== null || child.signalCode !== null, 'normal application exit');
      }
    };
  } catch (error) { await stop(); throw error; }
}

async function replaceEditor(app, text) {
  const point = await app.renderer.evaluate("(() => { const r = document.querySelector('#editor .view-lines').getBoundingClientRect(); return { x: r.x + 80, y: r.y + 10 }; })()");
  await app.renderer.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await app.renderer.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  await app.renderer.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await app.renderer.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
  await app.renderer.call('Input.insertText', { text });
}

(async () => {
  await fs.access(executable);
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'profile-'));
  const exceptions = [];
  let app;
  let stage = 'startup and editing';
  try {
    app = await launch(profile, 1, exceptions);
    const ui = expression => app.renderer.evaluate(expression);
    await ui("document.querySelector('#new').click()");
    await app.renderer.call('Input.insertText', { text: 'print(6 * 7)' });
    await ui("document.querySelector('#run').click()");
    await app.wait("document.querySelector('#messages').innerText.includes('Finished.') && !document.querySelector('#run').disabled");
    assert.match(await ui("document.querySelector('#messages').innerText"), /\] 42(?:\r?\n|$)/);
    assert.equal((await ui("window.ohm.runOffline('local =')")).ok, false);

    await ui("document.querySelector('[data-view=autoexec]').click()");
    await app.wait("document.querySelector('#sidebarBody .side-primary') !== null");
    await ui("document.querySelector('#sidebarBody .side-primary').click(); document.querySelector('#autoexecName').value = 'CON.lua'; document.querySelector('#saveAutoexec').click()");
    await app.wait("document.querySelector('#autoexecError').innerText.includes('reserved')");
    await ui("document.querySelector('#autoexecName').value = 'smoke.luau'; document.querySelector('#saveAutoexec').click()");
    await app.wait("!document.querySelector('#autoexecDialog').open && document.querySelector('.autoexec-open') !== null");
    await ui("document.querySelector('.autoexec-open').click()");
    await app.wait("document.querySelectorAll('.tab').length === 2");
    await replaceEditor(app, 'print(84)');
    await ui("document.querySelector('#save').click()");
    await app.wait("!document.querySelector('.tab.active').textContent.includes('●')");
    const autoexecFile = path.join(profile, 'autoexec', 'smoke.luau');
    assert.equal(await fs.readFile(autoexecFile, 'utf8'), 'print(84)');
    await replaceEditor(app, 'print(126)');
    await app.wait("document.querySelector('#recoveryStatus').textContent === 'Drafts saved locally'");
    await waitFor(async () => {
      try { return JSON.parse(await fs.readFile(path.join(profile, 'drafts.json'), 'utf8')).drafts.some(d => d.content === 'print(126)'); }
      catch { return false; }
    }, 'latest recovery contents');

    await ui("document.querySelector('#settingsButton').click(); document.querySelector('#fontSize').value = 18; document.querySelector('#theme').value = 'light'; document.querySelector('#saveSettings').click()");
    await app.wait("document.documentElement.dataset.theme === 'light'");
    await ui("document.querySelector('#settingsButton').click(); document.querySelector('#fontSize').value = 19");
    await app.renderer.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await app.renderer.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await app.wait("!document.querySelector('#settingsDialog').open");
    assert.equal((await ui('window.ohm.getSettings()')).fontSize, 18);
    await ui("document.querySelector('[data-view=files]').click(); document.querySelector('[data-view=autoexec]').click(); document.querySelector('[data-view=about]').click()");
    await app.wait("document.querySelector('#sidebarBody .about') !== null");
    await pause(200);
    assert.equal(await ui("document.querySelectorAll('#sidebarBody .tree-row, #sidebarBody .autoexec-row').length"), 0);
    const saved = await ui(`(async () => {
      const file = (await window.ohm.init()).workspace + '/ordered.lua';
      await Promise.all(Array.from({length: 12}, (_, i) => window.ohm.saveFile(file, 'print(' + i + ')')));
      return window.ohm.readFile(file);
    })()`);
    assert.equal(saved, 'print(11)');
    await app.stop(); // Simulate abrupt exit, then reopen the same isolated profile.

    stage = 'reopen after abrupt exit';
    app = await launch(profile, 2, exceptions);
    assert.equal(await ui("document.querySelectorAll('.tab').length"), 2);
    assert.equal(await ui("[...document.querySelectorAll('.tab')].every(tab => tab.title === 'Unsaved script' && tab.textContent.includes('●'))"), true);
    assert.equal(await fs.readFile(autoexecFile, 'utf8'), 'print(84)');
    assert.equal(await ui("document.documentElement.dataset.theme"), 'light');
    await ui("document.querySelector('#run').click()");
    await app.wait("document.querySelector('#messages').innerText.includes('126') && !document.querySelector('#run').disabled");
    stage = 'cancel window close';
    console.log(stage);
    await app.requestClose();
    await waitFor(() => app.main.evaluate('globalThis.__ohmSmokeDialogs === 1'), 'close confirmation');
    await app.wait("!document.querySelector('.shell').inert");
    assert.equal(await ui("document.querySelectorAll('.tab').length"), 2);
    await app.main.evaluate('globalThis.__ohmSmokeResponse = 1');
    await ui("document.querySelector('.tab.active').click()");
    await replaceEditor(app, 'print(168)');
    await app.wait("document.querySelector('#editor .view-lines').innerText.includes('168')");
    stage = 'keep drafts and close';
    console.log(stage);
    await app.requestClose();
    await app.exited();
    await app.stop();
    assert.ok(JSON.parse(await fs.readFile(path.join(profile, 'drafts.json'), 'utf8')).drafts.some(draft => draft.content === 'print(168)'));

    stage = 'reopen kept drafts';
    app = await launch(profile, 3, exceptions);
    await ui("document.querySelector('#run').click()");
    await app.wait("document.querySelector('#messages').innerText.includes('168') && !document.querySelector('#run').disabled");
    const screenshot = await app.renderer.call('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(output, 'recovered-drafts.png'), Buffer.from(screenshot.data, 'base64'));
    await app.main.evaluate('globalThis.__ohmSmokeResponse = 2');
    stage = 'discard and close';
    console.log(stage);
    await app.requestClose();
    await app.exited();
    await app.stop();
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(profile, 'drafts.json'), 'utf8')).drafts, []);

    stage = 'reopen after discard';
    app = await launch(profile, 4, exceptions);
    assert.equal(await ui("document.querySelectorAll('.tab').length"), 0);
    await app.requestClose();
    await app.exited();
    assert.deepEqual(exceptions, []);
    const result = {
      executable, profile, startup: 'passed', localOutput: 42, syntaxError: 'reported',
      autoexecSaveOpenEdit: 'passed', reservedFilename: 'rejected', settingsSaveCancelRestart: 'passed',
      latestSidebarWins: 'passed', concurrentSaves: 'passed', abruptExitRecovery: 'passed',
      recoveryLeavesOriginalUnchanged: 'passed', closeCancelKeepDiscard: 'passed',
      nativeDialogChoices: 'simulated only in the test process', rendererExceptions: exceptions.length
    };
    await fs.writeFile(path.join(output, 'smoke-result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const diagnostics = { stage, profile };
    try { diagnostics.page = await app.renderer.evaluate('document.body.innerText'); } catch {}
    try { diagnostics.dialogs = await app.main.evaluate('globalThis.__ohmSmokeDialogs'); } catch {}
    await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify(diagnostics, null, 2));
    throw new Error(`Smoke test failed during ${stage}`, { cause: error });
  }
  finally { await app?.stop(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
