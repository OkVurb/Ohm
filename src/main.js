import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import 'monaco-editor/languages/definitions/lua/register';
import './style.css';
import { saveTab, hasUnsavedWork } from './save.mjs';
import { createDraftRecovery, snapshotDrafts } from './recovery.mjs';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

const app = document.querySelector('#app');
app.innerHTML = `
  <div class="shell">
    <header class="titlebar"><div class="brand"><span class="brandmark">Ω</span><strong>Ohm</strong><small>WORKSPACE</small></div>
      <div class="toolbar"><button id="new" title="New script (Ctrl+N)">New</button><button id="open" title="Open files (Ctrl+O)">Open</button><button id="save" title="Save (Ctrl+S)">Save</button><span class="divider"></span><button id="run" class="primary" title="Run locally in Luau, without Roblox APIs">▶ Run offline</button></div>
      <div class="title-actions"><button id="settingsButton" title="Settings">⚙</button></div>
    </header>
    <div class="body">
      <nav class="rail" aria-label="Views"><button class="active" data-view="files" title="Files">▤</button><button data-view="autoexec" title="Autoexec">⌁</button><button data-view="roblox" title="Roblox">◇</button><button data-view="about" title="About">ⓘ</button></nav>
      <aside class="sidebar"><div class="sidebar-title"><span id="sidebarTitle">EXPLORER</span><button id="sidebarAction" title="Refresh">↻</button></div><div id="sidebarBody"></div></aside>
      <main class="workarea"><div id="tabs" class="tabs"></div><div id="editor"></div><div id="welcome" class="welcome"><span class="welcome-mark">Ω</span><h1>Make something work.</h1><p>Open a Luau script or create a new one to start editing.</p><div class="welcome-actions"><button id="welcomeNew">New script</button><button id="welcomeOpen">Open file</button></div></div><section class="output"><div class="output-title">OUTPUT <button id="clearOutput" title="Clear output">Clear</button></div><div id="messages" role="log" aria-live="polite"></div></section></main>
    </div>
    <footer class="status"><span id="statusLeft">Ready</span><span id="recoveryStatus"></span><span id="statusRight">Luau · Ohm</span></footer>
  </div>
  <dialog id="settingsDialog"><form method="dialog"><div class="dialog-head"><h2>Settings</h2><button aria-label="Close">×</button></div><label>Theme<select id="theme"><option value="dark">Dark</option><option value="light">Light</option></select></label><label>Font size<input id="fontSize" type="number" min="10" max="28" /></label><label class="check"><input id="wordWrap" type="checkbox" /> Word wrap</label><label class="check"><input id="alwaysOnTop" type="checkbox" /> Always on top</label><div class="dialog-actions"><button id="saveSettings" value="save" class="primary">Save settings</button></div></form></dialog>
  <dialog id="autoexecDialog" aria-labelledby="autoexecTitle"><form id="autoexecForm"><div class="dialog-head"><h2 id="autoexecTitle">Save to autoexec</h2></div><label>Filename<input id="autoexecName" required maxlength="85" spellcheck="false" /></label><p class="dialog-note">Use a .lua or .luau filename. These scripts are stored locally and do not run automatically.</p><p id="autoexecError" role="alert"></p><div class="dialog-actions"><button id="cancelAutoexec" type="button">Cancel</button><button id="saveAutoexec" type="submit" class="primary">Save script</button></div></form></dialog>
`;

const $ = selector => document.querySelector(selector);
const state = { tabs: [], active: null, view: 'files', workspace: '', settings: null, closing: false };
let editor;
let draftRecovery;
let allowClose = false;
let sidebarRevision = 0;
let autoexecSource = null;
let savingAutoexec = false;

function log(message, kind = 'info') {
  const row = document.createElement('div');
  row.className = `message ${kind}`;
  const text = String(message);
  row.textContent = `[${new Date().toLocaleTimeString()}] ${text.length > 65536 ? text.slice(0, 65536) + '\n[Output truncated in view]' : text}`;
  const messages = $('#messages');
  messages.prepend(row);
  while (messages.childElementCount > 200) messages.lastElementChild.remove();
}

function showError(error) { log(error?.message || String(error), 'error'); }
function titleOf(tab) { return tab.path ? tab.path.split(/[\\/]/).pop() : tab.name; }

function applySettings() {
  document.documentElement.dataset.theme = state.settings.theme;
  if (editor) editor.updateOptions({ fontSize: state.settings.fontSize, wordWrap: state.settings.wordWrap ? 'on' : 'off' });
  monaco.editor.setTheme(state.settings.theme === 'light' ? 'vs' : 'vs-dark');
}

function renderTabs() {
  const container = $('#tabs');
  container.replaceChildren();
  for (const tab of state.tabs) {
    const button = document.createElement('button');
    button.className = `tab ${state.active === tab.id ? 'active' : ''}`;
    button.textContent = `${tab.dirty ? '● ' : ''}${titleOf(tab)}`;
    button.title = tab.path || 'Unsaved script';
    button.addEventListener('click', () => activate(tab.id));
    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '×';
    close.title = 'Close tab';
    close.addEventListener('click', event => { event.stopPropagation(); closeTab(tab.id); });
    button.append(close);
    container.append(button);
  }
  $('#welcome').hidden = state.tabs.length > 0;
  $('#editor').hidden = state.tabs.length === 0;
  editor?.layout();
}

function activate(id) {
  const tab = state.tabs.find(item => item.id === id);
  if (!tab) return;
  state.active = id;
  editor.setModel(tab.model);
  $('#statusLeft').textContent = tab.path || 'Unsaved script';
  renderTabs();
  if (state.tabs.some(item => item.dirty)) draftRecovery?.schedule();
}

function addTab(path, content = '', name = 'Untitled.lua', options = {}) {
  const samePath = value => window.ohm.platform === 'win32' ? value?.toLowerCase() : value;
  const existing = state.tabs.find(tab => path && samePath(tab.path) === samePath(path));
  if (existing) { activate(existing.id); return existing; }
  const id = options.id || crypto.randomUUID();
  const model = monaco.editor.createModel(content, 'lua');
  const tab = { id, name, path, model, dirty: options.dirty || false };
  model.onDidChangeContent(() => { tab.dirty = true; renderTabs(); draftRecovery?.schedule(); });
  state.tabs.push(tab);
  activate(id);
  editor.focus();
  return tab;
}

function closeTab(id) {
  const index = state.tabs.findIndex(tab => tab.id === id);
  if (index < 0) return;
  const tab = state.tabs[index];
  if (tab.saving) return log('Wait for the save to finish before closing this tab.');
  if (tab.dirty && !confirm(`Discard unsaved changes in ${titleOf(tab)}?`)) return;
  state.tabs.splice(index, 1);
  tab.model.dispose();
  if (state.active === id) {
    const next = state.tabs[Math.min(index, state.tabs.length - 1)];
    state.active = null;
    if (next) activate(next.id);
    else { editor.setModel(null); $('#statusLeft').textContent = 'Ready'; renderTabs(); }
  } else renderTabs();
  draftRecovery.schedule();
}

async function openFiles() {
  try { for (const file of await window.ohm.openFiles()) addTab(file.path, file.content); }
  catch (error) { showError(error); }
}

async function openWorkspaceFile(path) {
  try { addTab(path, await window.ohm.readFile(path)); }
  catch (error) { showError(error); }
}

async function saveActive() {
  const tab = state.tabs.find(item => item.id === state.active);
  if (!tab) return;
  try {
    if (!await saveTab(tab, window.ohm)) return;
    renderTabs();
    if (state.active === tab.id) $('#statusLeft').textContent = tab.path;
    log(`Saved ${titleOf(tab)}`);
    renderSidebar();
  } catch (error) { showError(error); }
  finally { draftRecovery.schedule(); }
}

function treeNode(entry, depth = 0) {
  const row = document.createElement('button');
  row.className = 'tree-row';
  row.style.paddingLeft = `${14 + depth * 14}px`;
  row.textContent = `${entry.type === 'folder' ? '▾' : '◇'}  ${entry.name}`;
  if (entry.type === 'file') row.addEventListener('click', () => openWorkspaceFile(entry.path));
  const nodes = [row];
  for (const child of entry.children || []) nodes.push(...treeNode(child, depth + 1));
  return nodes;
}

async function renderSidebar() {
  const revision = ++sidebarRevision;
  const view = state.view;
  const body = document.createElement('div');
  $('#sidebarBody').replaceChildren(emptyText('Loading…'));
  const heading = { files: 'EXPLORER', autoexec: 'AUTOEXEC', roblox: 'ROBLOX', about: 'ABOUT' };
  $('#sidebarTitle').textContent = heading[view];
  $('#sidebarAction').hidden = view === 'about';
  try {
    if (view === 'files') {
      const controls = document.createElement('div');
      controls.className = 'side-actions';
      const change = document.createElement('button');
      change.textContent = 'Change workspace';
      change.onclick = async () => {
        try { state.workspace = await window.ohm.chooseWorkspace(); renderSidebar(); }
        catch (error) { showError(error); }
      };
      controls.append(change);
      body.append(controls);
      const root = document.createElement('div');
      root.className = 'folder-name';
      root.textContent = state.workspace.split(/[\\/]/).pop() || 'workspace';
      root.title = state.workspace;
      body.append(root);
      const files = await window.ohm.listWorkspace();
      for (const entry of files) body.append(...treeNode(entry));
      if (!files.length) body.append(emptyText('This workspace has no scripts yet. Save one here to see it.'));
    } else if (view === 'autoexec') {
      const note = emptyText('Autoexec files are stored locally. Ohm does not run them automatically.');
      body.append(note);
      const add = document.createElement('button');
      add.className = 'side-primary';
      add.textContent = 'Save active script to autoexec';
      add.onclick = () => {
        const tab = state.tabs.find(item => item.id === state.active);
        if (!tab) return log('Open a script first', 'error');
        autoexecSource = tab.model.getValue();
        $('#autoexecName').value = titleOf(tab).replace(/\.[^.]+$/, '') + '.lua';
        $('#autoexecError').textContent = '';
        $('#autoexecDialog').showModal();
        $('#autoexecName').select();
      };
      body.append(add);
      const names = await window.ohm.listAutoexec();
      for (const name of names) {
        const row = document.createElement('div');
        row.className = 'autoexec-row';
        const label = document.createElement('button');
        label.className = 'autoexec-open';
        label.textContent = name;
        label.title = `Open ${name}`;
        label.onclick = async () => {
          try {
            const file = await window.ohm.readAutoexec(name);
            addTab(file.path, file.content);
          } catch (error) { showError(error); }
        };
        const remove = document.createElement('button');
        remove.textContent = '×';
        remove.title = `Delete ${name}`;
        remove.onclick = async () => {
          if (!confirm(`Delete autoexec/${name}?`)) return;
          try { await window.ohm.deleteAutoexec(name); renderSidebar(); }
          catch (error) { showError(error); }
        };
        row.append(label, remove);
        body.append(row);
      }
      if (!names.length) body.append(emptyText('No autoexec scripts saved yet.'));
    } else if (view === 'roblox') {
      const note = emptyText('Detected Roblox Player processes. Script execution needs a compatible bridge that is not included in this build.');
      body.append(note);
      const choose = document.createElement('button');
      choose.className = 'side-primary';
      choose.textContent = 'Choose Roblox executable';
      choose.onclick = async () => { try { await window.ohm.chooseRoblox(); renderSidebar(); } catch (error) { showError(error); } };
      body.append(choose);
      const launch = document.createElement('button');
      launch.className = 'side-primary secondary';
      launch.textContent = 'Launch Roblox';
      launch.onclick = async () => { try { await window.ohm.launchRoblox(); log('Opened Roblox'); } catch (error) { showError(error); } };
      body.append(launch);
      const processes = await window.ohm.listRoblox();
      for (const item of processes) {
        const row = document.createElement('div');
        row.className = 'process-row';
        const label = document.createElement('span');
        label.textContent = `Roblox · PID ${item.pid}`;
        const end = document.createElement('button');
        end.textContent = 'End';
        end.onclick = async () => {
          if (!confirm(`End Roblox process ${item.pid}?`)) return;
          try { await window.ohm.terminateRoblox(item.pid); log(`Ended Roblox process ${item.pid}`); renderSidebar(); }
          catch (error) { showError(error); }
        };
        row.append(label, end);
        body.append(row);
      }
      if (!processes.length) body.append(emptyText('No Roblox Player process detected.'));
    } else {
      const about = document.createElement('div');
      about.className = 'about';
      about.innerHTML = '<span class="about-mark">Ω</span><h2>Ohm</h2><p>An independent desktop Luau workspace.</p><p>Editor, files, themes, local autoexec storage, and Roblox process controls are available. Script injection, account services, and automatic updates are not implemented.</p>';
      body.append(about);
    }
  } catch (error) {
    body.append(emptyText('Could not load this view. Try Refresh.'));
    if (revision === sidebarRevision) showError(error);
  }
  if (revision === sidebarRevision && view === state.view) $('#sidebarBody').replaceChildren(...body.childNodes);
}

function emptyText(value) {
  const p = document.createElement('p');
  p.className = 'empty-text';
  p.textContent = value;
  return p;
}

async function prepareClose() {
  if (state.closing) return;
  state.closing = true;
  $('.shell').inert = true;
  for (const dialog of document.querySelectorAll('dialog')) dialog.inert = true;
  editor.updateOptions({ readOnly: true });
  try {
    await draftRecovery.pause();
    // A pending Save As must settle before choosing what work still needs recovery.
    await Promise.allSettled(state.tabs.filter(tab => tab.saving).map(tab => tab.saving));
    allowClose = await window.ohm.prepareClose(snapshotDrafts(state.tabs, state.active));
    if (allowClose) window.close();
  } catch (error) { showError(error); }
  finally {
    if (!allowClose) {
      state.closing = false;
      $('.shell').inert = false;
      for (const dialog of document.querySelectorAll('dialog')) dialog.inert = false;
      editor.updateOptions({ readOnly: false });
      draftRecovery.resume();
    }
  }
}

function bind() {
  $('#new').onclick = $('#welcomeNew').onclick = () => addTab(null);
  $('#open').onclick = $('#welcomeOpen').onclick = openFiles;
  $('#save').onclick = saveActive;
  $('#run').onclick = async () => {
    const tab = state.tabs.find(item => item.id === state.active);
    if (!tab) return log('Open a script first', 'error');
    $('#run').disabled = true;
    log('Running locally in Luau. Roblox APIs are unavailable.');
    try {
      const result = await window.ohm.runOffline(tab.model.getValue());
      if (result.stdout) log(result.stdout.trimEnd());
      if (result.stderr) log(result.stderr.trimEnd(), 'error');
      else if (result.ok) log('Finished.');
    } catch (error) { showError(error); }
    finally { $('#run').disabled = false; }
  };
  $('#clearOutput').onclick = () => $('#messages').replaceChildren();
  $('#sidebarAction').onclick = renderSidebar;
  for (const button of document.querySelectorAll('.rail button')) button.onclick = () => {
    for (const item of document.querySelectorAll('.rail button')) item.classList.toggle('active', item === button);
    state.view = button.dataset.view;
    renderSidebar();
  };
  $('#settingsButton').onclick = () => {
    $('#theme').value = state.settings.theme;
    $('#fontSize').value = state.settings.fontSize;
    $('#wordWrap').checked = state.settings.wordWrap;
    $('#alwaysOnTop').checked = state.settings.alwaysOnTop;
    $('#settingsDialog').returnValue = '';
    $('#settingsDialog').showModal();
  };
  $('#settingsDialog').addEventListener('close', async () => {
    if ($('#settingsDialog').returnValue !== 'save') return;
    try {
      state.settings = await window.ohm.setSettings({ theme: $('#theme').value, fontSize: Number($('#fontSize').value), wordWrap: $('#wordWrap').checked, alwaysOnTop: $('#alwaysOnTop').checked });
      applySettings();
      log('Settings saved');
    } catch (error) { showError(error); }
  });
  $('#cancelAutoexec').onclick = () => $('#autoexecDialog').close();
  $('#autoexecDialog').addEventListener('close', () => { autoexecSource = null; });
  $('#autoexecDialog').addEventListener('cancel', event => { if (savingAutoexec) event.preventDefault(); });
  $('#autoexecForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (savingAutoexec || autoexecSource === null) return;
    savingAutoexec = true;
    $('#autoexecName').disabled = $('#saveAutoexec').disabled = $('#cancelAutoexec').disabled = true;
    $('#autoexecError').textContent = '';
    try {
      const name = await window.ohm.saveAutoexec($('#autoexecName').value, autoexecSource);
      if (name) {
        $('#autoexecDialog').close();
        log(`Saved autoexec/${name}`);
        renderSidebar();
      }
    } catch (error) { $('#autoexecError').textContent = error.message || String(error); }
    finally {
      savingAutoexec = false;
      $('#autoexecName').disabled = $('#saveAutoexec').disabled = $('#cancelAutoexec').disabled = false;
    }
  });
  window.addEventListener('beforeunload', event => {
    if (allowClose || (!hasUnsavedWork(state.tabs) && !draftRecovery.pending)) return;
    event.preventDefault();
    event.returnValue = false;
  });
  window.addEventListener('keydown', event => {
    if (state.closing || document.querySelector('dialog[open]')) return;
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 's') { event.preventDefault(); saveActive(); }
    if (key === 'o') { event.preventDefault(); openFiles(); }
    if (key === 'n') { event.preventDefault(); addTab(null); }
  });
}

async function start() {
  const initial = await window.ohm.init();
  state.workspace = initial.workspace;
  state.settings = initial.settings;
  editor = monaco.editor.create($('#editor'), { language: 'lua', theme: 'vs-dark', automaticLayout: true, minimap: { enabled: true }, fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: 14, scrollBeyondLastLine: false, padding: { top: 18 } });
  applySettings();
  for (const draft of initial.recovery.drafts) addTab(null, draft.content, draft.name, { id: draft.id, dirty: true });
  if (initial.recovery.activeId) activate(initial.recovery.activeId);
  let reportedRecoveryError = false;
  draftRecovery = createDraftRecovery({
    snapshot: () => snapshotDrafts(state.tabs, state.active),
    save: snapshot => window.ohm.saveRecovery(snapshot),
    onSaved: () => { reportedRecoveryError = false; $('#recoveryStatus').textContent = state.tabs.some(tab => tab.dirty) ? 'Drafts saved locally' : ''; },
    onError: error => {
      $('#recoveryStatus').textContent = 'Draft recovery failed';
      if (!reportedRecoveryError) showError(error);
      reportedRecoveryError = true;
    }
  });
  bind();
  window.ohm.onCloseRequested(prepareClose);
  await window.ohm.rendererReady();
  renderTabs();
  renderSidebar();
  log('Ohm is ready. Local workspace loaded.');
  if (initial.recovery.drafts.length) log('Recovered unsaved drafts. Save them to files when ready.');
  if (initial.recoveryWarning) showError(initial.recoveryWarning);
}

start().catch(error => { showError(error); $('#statusLeft').textContent = 'Startup failed'; });
