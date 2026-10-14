const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { defaults, cleanSettings, autoexecName, inside } = require('./core.cjs');
const { runOffline } = require('./offline.cjs');
const { writeAtomic } = require('./storage.cjs');
const { cleanRecovery, emptyRecovery, loadRecovery } = require('./recovery.cjs');
const inject = require('./injection.js');

const exec = promisify(execFile);
const maxScriptBytes = 2 * 1024 * 1024;
let win;
let root;
let workspace;
let settingsPath;
let settings;
let recovery;
let recoveryPath;
let recoveryError;
let pendingRecovery = Promise.resolve();
const approvedFiles = new Set();
let pendingFileSave = Promise.resolve();
let pendingSettings = Promise.resolve();
let pendingClose;
let rendererReady = false;
let closeApproved = false;

function updateSettings(patch) {
  const update = pendingSettings.catch(() => {}).then(async () => {
    const next = cleanSettings(patch, settings);
    await writeAtomic(settingsPath, JSON.stringify(next, null, 2));
    settings = next;
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(next.alwaysOnTop);
    return next;
  });
  pendingSettings = update;
  return update;
}

function saveRecovery(value) {
  const next = cleanRecovery(value);
  const save = pendingRecovery.catch(() => {}).then(async () => {
    if (recoveryError) {
      // Startup did not restore this file into the editor. Preserve even valid
      // old drafts before allowing current buffers to replace the checkpoint.
      recovery = await loadRecovery(recoveryPath, { preserveExisting: true });
      recoveryError = null;
    }
    await writeAtomic(recoveryPath, JSON.stringify(next));
    recovery.session = next;
    return true;
  });
  pendingRecovery = save;
  return save;
}

function fileOperation(operation) {
  // Queue mutations before async validation so saves, replacements and deletes
  // retain IPC submission order, including operations on the same autoexec file.
  const next = pendingFileSave.catch(() => {}).then(operation);
  pendingFileSave = next;
  return next;
}

async function autoexecFile(name, allowNew = false) {
  const file = path.join(root, 'autoexec', autoexecName(name));
  try {
    if (!(await fsp.lstat(file)).isFile()) throw new Error('Autoexec scripts must be regular files');
    return { file, exists: true };
  } catch (error) {
    if (allowNew && error.code === 'ENOENT') return { file, exists: false };
    throw error;
  }
}

async function readScript(file) {
  if ((await fsp.stat(file)).size > maxScriptBytes) throw new Error('Script exceeds 2 MB');
  return fsp.readFile(file, 'utf8');
}

function checkedText(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > maxScriptBytes) throw new TypeError('Script exceeds 2 MB or is not text');
  return value;
}

async function checkedFile(file, allowNew = false) {
  if (typeof file !== 'string' || file.length > 4096 || !path.isAbsolute(file)) throw new TypeError('Invalid file path');
  const absolute = path.resolve(file);
  const base = await fsp.realpath(workspace);
  const exists = fs.existsSync(absolute);
  const real = exists ? await fsp.realpath(absolute) : path.join(await fsp.realpath(path.dirname(absolute)), path.basename(absolute));
  if (!inside(base, real) && !approvedFiles.has(real)) throw new Error('Choose this file in Ohm before opening it');
  if (!exists && !allowNew) throw new Error('File does not exist');
  if (!/\.(lua|luau|txt|json|md)$/i.test(real)) throw new Error('Unsupported text file type');
  return real;
}

function checkSender(event) {
  if (!win || event.sender !== win.webContents) throw new Error('Invalid window');
}

function handle(channel, fn) {
  ipcMain.handle(`ohm:${channel}`, async (event, ...args) => {
    checkSender(event);
    return fn(...args);
  });
}

async function listTree(folder, depth = 0) {
  if (depth > 3) return [];
  const entries = await fsp.readdir(folder, { withFileTypes: true });
  const output = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) output.push({ name: entry.name, path: file, type: 'folder', children: await listTree(file, depth + 1) });
    else if (entry.isFile() && /\.(lua|luau|txt|json|md)$/i.test(entry.name)) output.push({ name: entry.name, path: file, type: 'file' });
  }
  return output;
}

async function listRoblox() {
  if (process.platform !== 'win32') return [];
  const { stdout } = await exec('tasklist', ['/FI', 'IMAGENAME eq RobloxPlayerBeta.exe', '/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 10000 });
  return stdout.split(/\r?\n/).map(line => {
    const match = line.match(/^"RobloxPlayerBeta\.exe","(\d+)"/i);
    return match ? { pid: Number(match[1]), name: 'RobloxPlayerBeta.exe' } : null;
  }).filter(Boolean);
}

async function createWindow() {
  rendererReady = false;
  closeApproved = false;
  win = new BrowserWindow({
    width: 1260, height: 790, minWidth: 870, minHeight: 560,
    title: 'Ohm', icon: path.join(__dirname, '..', 'assets', 'ohm-icon.ico'), backgroundColor: '#0e1015', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('render-process-gone', () => { rendererReady = false; });
  // Intercept the native close before beforeunload, including restored sessions
  // where Chromium has not yet received a user gesture.
  win.on('close', event => {
    if (closeApproved || !rendererReady) return;
    event.preventDefault();
    win.webContents.send('ohm:close-requested');
  });
  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
app.on('second-instance', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});
app.whenReady().then(async () => {
  root = app.getPath('userData');
  workspace = path.join(root, 'workspace');
  settingsPath = path.join(root, 'settings.json');
  recoveryPath = path.join(root, 'drafts.json');
  await fsp.mkdir(workspace, { recursive: true });
  await fsp.mkdir(path.join(root, 'autoexec'), { recursive: true });
  try { recovery = await loadRecovery(recoveryPath); }
  catch (error) {
    recoveryError = `Draft recovery is unavailable: ${error.message}`;
    recovery = { session: emptyRecovery(), warning: recoveryError };
  }
  try { settings = cleanSettings(JSON.parse(await fsp.readFile(settingsPath, 'utf8'))); }
  catch { settings = { ...defaults }; }
  try {
    const saved = JSON.parse(await fsp.readFile(path.join(root, 'workspace.json'), 'utf8'));
    if (typeof saved.path === 'string' && (await fsp.stat(saved.path)).isDirectory()) workspace = await fsp.realpath(saved.path);
  } catch { /* Keep the built-in workspace if a saved folder moved. */ }

  handle('init', async () => ({ workspace, settings, recovery: recovery.session, recoveryWarning: recovery.warning }));
  handle('renderer-ready', () => { rendererReady = true; return true; });
  handle('save-recovery', saveRecovery);
  handle('prepare-close', snapshot => {
    if (pendingClose) return pendingClose;
    closeApproved = false;
    pendingClose = (async () => {
      if (!snapshot || !Array.isArray(snapshot.drafts)) throw new TypeError('Invalid close request');
      await Promise.allSettled([pendingFileSave, pendingSettings]);
      let next = emptyRecovery();
      if (snapshot.drafts.length) {
        const { response } = await dialog.showMessageBox(win, {
          type: 'warning',
          buttons: ['Keep editing', 'Keep drafts and close', 'Discard changes and close'],
          defaultId: 0, cancelId: 0, title: 'Unsaved changes',
          message: 'Some scripts have unsaved changes.',
          detail: 'Keep drafts saves a local recovery copy and restores it next time. Original files stay unchanged.'
        });
        if (response === 0) return false;
        if (response === 1) next = cleanRecovery(snapshot);
        else if (response !== 2) return false;
      }
      try { await saveRecovery(next); }
      catch (error) {
        const { response } = await dialog.showMessageBox(win, {
          type: 'error', buttons: ['Keep editing', 'Close without recovery'],
          defaultId: 0, cancelId: 0, title: 'Draft recovery could not be saved',
          message: 'Ohm could not update your recovery copy.',
          detail: `${error.message}\n\nSave your scripts to files before closing. Closing now can lose unsaved changes. Older recovery data will remain and may reappear next time.`
        });
        if (response !== 1) return false;
      }
      closeApproved = true;
      return true;
    })().finally(() => { pendingClose = null; });
    return pendingClose;
  });
  handle('open-files', async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Text and Luau', extensions: ['lua', 'luau', 'txt', 'json', 'md'] }] });
    if (result.canceled) return [];
    const files = [];
    for (const file of result.filePaths) {
      const real = await fsp.realpath(file);
      approvedFiles.add(real);
      files.push({ path: real, content: await readScript(real) });
    }
    return files;
  });
  handle('read-file', async file => readScript(await checkedFile(file)));
  handle('save-file', (file, content) => fileOperation(async () => {
    await writeAtomic(await checkedFile(file, true), checkedText(content));
    return file;
  }));
  handle('save-as', async (name, content) => {
    const result = await dialog.showSaveDialog(win, { defaultPath: path.join(workspace, path.basename(String(name || 'script.lua'))), filters: [{ name: 'Luau', extensions: ['lua', 'luau'] }, { name: 'Text', extensions: ['txt', 'json', 'md'] }] });
    if (result.canceled || !result.filePath) return null;
    return fileOperation(async () => {
      const file = path.resolve(result.filePath);
      approvedFiles.add(file);
      await writeAtomic(await checkedFile(file, true), checkedText(content));
      return file;
    });
  });
  handle('list-workspace', async () => listTree(workspace));
  handle('choose-workspace', async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (result.canceled) return workspace;
    const chosen = await fsp.realpath(result.filePaths[0]);
    await writeAtomic(path.join(root, 'workspace.json'), JSON.stringify({ path: chosen }));
    workspace = chosen;
    return workspace;
  });
  handle('get-settings', async () => settings);
  handle('set-settings', updateSettings);
  handle('list-autoexec', async () => (await fsp.readdir(path.join(root, 'autoexec'), { withFileTypes: true }))
    .filter(entry => {
      if (!entry.isFile()) return false;
      try { autoexecName(entry.name); return true; } catch { return false; }
    }).map(entry => entry.name).sort((a, b) => a.localeCompare(b)));
  handle('read-autoexec', async name => {
    const { file } = await autoexecFile(name);
    const real = await fsp.realpath(file);
    const content = await readScript(real);
    approvedFiles.add(real);
    return { path: real, content };
  });
  handle('run-offline', async source => {
    const executable = app.isPackaged
      ? path.join(process.resourcesPath, 'luau', 'luau.exe')
      : path.join(__dirname, '..', 'vendor', 'luau', 'luau.exe');
    return runOffline(checkedText(source), executable);
  });
  handle('save-autoexec', (name, content) => fileOperation(async () => {
    checkedText(content);
    const { file, exists } = await autoexecFile(name, true);
    if (exists) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'question', buttons: ['Cancel', 'Replace'], defaultId: 0, cancelId: 0,
        title: 'Replace autoexec script', message: `Replace ${name}?`, detail: 'This replaces the saved autoexec file.'
      });
      if (response !== 1) return null;
    }
    await writeAtomic(file, content);
    return name;
  }));
  handle('delete-autoexec', name => fileOperation(async () => {
    await fsp.unlink((await autoexecFile(name)).file);
    return true;
  }));
  handle('list-roblox', listRoblox);
  handle('choose-roblox', async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Roblox executable', extensions: ['exe'] }] });
    if (result.canceled) return settings.robloxPath;
    const chosen = result.filePaths[0];
    if (path.basename(chosen).toLowerCase() !== 'robloxplayerbeta.exe') throw new Error('Choose RobloxPlayerBeta.exe');
    return (await updateSettings({ robloxPath: chosen })).robloxPath;
  });
  // Loading the bridge is safe even when its native backend is unavailable.
  handle('launch-roblox-injector', async () => ({
    success: false,
    code: 'BACKEND_UNAVAILABLE',
    error: inject.status().message
  }));

  handle('launch-roblox', async () => {
    if (!settings.robloxPath || path.basename(settings.robloxPath).toLowerCase() !== 'robloxplayerbeta.exe') throw new Error('Choose RobloxPlayerBeta.exe first');
    const error = await shell.openPath(settings.robloxPath);
    if (error) throw new Error(error);
    return true;
  });
  handle('terminate-roblox', async pid => {

    if (!Number.isInteger(pid) || !(await listRoblox()).some(item => item.pid === pid)) throw new Error('Roblox process not found');
    process.kill(pid);
    return true;
  });
  handle('set-topmost', async value => (await updateSettings({ alwaysOnTop: value })).alwaysOnTop);
  await createWindow();
  win.setAlwaysOnTop(settings.alwaysOnTop);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(console.error); });
}).catch(error => { console.error(error); app.quit(); });
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
