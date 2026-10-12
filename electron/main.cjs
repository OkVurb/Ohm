const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { defaults, cleanSettings, autoexecName, inside } = require('./core.cjs');
const { runOffline } = require('./offline.cjs');

const exec = promisify(execFile);
const maxScriptBytes = 2 * 1024 * 1024;
let win;
let root;
let workspace;
let settingsPath;
let settings;
const approvedFiles = new Set();

async function writeAtomic(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(temp, value, 'utf8');
  await fsp.rename(temp, file);
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
  win = new BrowserWindow({
    width: 1260, height: 790, minWidth: 870, minHeight: 560,
    title: 'Ohm', icon: path.join(__dirname, '..', 'assets', 'ohm-icon.ico'), backgroundColor: '#0e1015', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(async () => {
  root = app.getPath('userData');
  workspace = path.join(root, 'workspace');
  settingsPath = path.join(root, 'settings.json');
  await fsp.mkdir(workspace, { recursive: true });
  await fsp.mkdir(path.join(root, 'autoexec'), { recursive: true });
  try { settings = cleanSettings(JSON.parse(await fsp.readFile(settingsPath, 'utf8'))); }
  catch { settings = { ...defaults }; }
  try {
    const saved = JSON.parse(await fsp.readFile(path.join(root, 'workspace.json'), 'utf8'));
    if (typeof saved.path === 'string' && (await fsp.stat(saved.path)).isDirectory()) workspace = await fsp.realpath(saved.path);
  } catch { /* Keep the built-in workspace if a saved folder moved. */ }

  handle('init', async () => ({ workspace, settings, files: await listTree(workspace), autoexec: await fsp.readdir(path.join(root, 'autoexec')) }));
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
  handle('save-file', async (file, content) => {
    await writeAtomic(await checkedFile(file, true), checkedText(content));
    return file;
  });
  handle('save-as', async (name, content) => {
    const result = await dialog.showSaveDialog(win, { defaultPath: path.join(workspace, path.basename(String(name || 'script.lua'))), filters: [{ name: 'Luau', extensions: ['lua', 'luau'] }, { name: 'Text', extensions: ['txt', 'json', 'md'] }] });
    if (result.canceled || !result.filePath) return null;
    const file = path.resolve(result.filePath);
    approvedFiles.add(file);
    await writeAtomic(await checkedFile(file, true), checkedText(content));
    return file;
  });
  handle('list-workspace', async () => listTree(workspace));
  handle('choose-workspace', async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (result.canceled) return workspace;
    workspace = await fsp.realpath(result.filePaths[0]);
    await writeAtomic(path.join(root, 'workspace.json'), JSON.stringify({ path: workspace }));
    return workspace;
  });
  handle('get-settings', async () => settings);
  handle('set-settings', async patch => {
    settings = cleanSettings(patch, settings);
    await writeAtomic(settingsPath, JSON.stringify(settings, null, 2));
    win.setAlwaysOnTop(settings.alwaysOnTop);
    return settings;
  });
  handle('list-autoexec', async () => (await fsp.readdir(path.join(root, 'autoexec'))).filter(name => /\.lua$/i.test(name)));
  handle('run-offline', async source => {
    const executable = app.isPackaged
      ? path.join(process.resourcesPath, 'luau', 'luau.exe')
      : path.join(__dirname, '..', 'vendor', 'luau', 'luau.exe');
    return runOffline(checkedText(source), executable);
  });
  handle('save-autoexec', async (name, content) => {
    await writeAtomic(path.join(root, 'autoexec', autoexecName(name)), checkedText(content));
    return name;
  });
  handle('delete-autoexec', async name => {
    await fsp.unlink(path.join(root, 'autoexec', autoexecName(name)));
    return true;
  });
  handle('list-roblox', listRoblox);
  handle('choose-roblox', async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Roblox executable', extensions: ['exe'] }] });
    if (result.canceled) return settings.robloxPath;
    settings = cleanSettings({ robloxPath: result.filePaths[0] }, settings);
    await writeAtomic(settingsPath, JSON.stringify(settings, null, 2));
    return settings.robloxPath;
  });
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
  handle('set-topmost', async value => {
    settings = cleanSettings({ alwaysOnTop: value }, settings);
    win.setAlwaysOnTop(value);
    await writeAtomic(settingsPath, JSON.stringify(settings, null, 2));
    return value;
  });
  await createWindow();
  win.setAlwaysOnTop(settings.alwaysOnTop);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch(error => { console.error(error); app.quit(); });

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
"// inject-roblox handler" 
