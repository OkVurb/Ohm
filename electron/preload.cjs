const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ohm', {
  init: () => ipcRenderer.invoke('ohm:init'),
  rendererReady: () => ipcRenderer.invoke('ohm:renderer-ready'),
  onCloseRequested: callback => {
    const listener = () => callback();
    ipcRenderer.on('ohm:close-requested', listener);
    return () => ipcRenderer.removeListener('ohm:close-requested', listener);
  },
  openFiles: () => ipcRenderer.invoke('ohm:open-files'),
  readFile: path => ipcRenderer.invoke('ohm:read-file', path),
  saveFile: (path, content) => ipcRenderer.invoke('ohm:save-file', path, content),
  saveAs: (name, content) => ipcRenderer.invoke('ohm:save-as', name, content),
  listWorkspace: () => ipcRenderer.invoke('ohm:list-workspace'),
  chooseWorkspace: () => ipcRenderer.invoke('ohm:choose-workspace'),
  getSettings: () => ipcRenderer.invoke('ohm:get-settings'),
  setSettings: patch => ipcRenderer.invoke('ohm:set-settings', patch),
  saveRecovery: snapshot => ipcRenderer.invoke('ohm:save-recovery', snapshot),
  prepareClose: snapshot => ipcRenderer.invoke('ohm:prepare-close', snapshot),
  listAutoexec: () => ipcRenderer.invoke('ohm:list-autoexec'),
  readAutoexec: name => ipcRenderer.invoke('ohm:read-autoexec', name),
  runOffline: source => ipcRenderer.invoke('ohm:run-offline', source),
  saveAutoexec: (name, content) => ipcRenderer.invoke('ohm:save-autoexec', name, content),
  deleteAutoexec: name => ipcRenderer.invoke('ohm:delete-autoexec', name),
  listRoblox: () => ipcRenderer.invoke('ohm:list-roblox'),
  chooseRoblox: () => ipcRenderer.invoke('ohm:choose-roblox'),
  launchRoblox: () => ipcRenderer.invoke('ohm:launch-roblox'),
  terminateRoblox: pid => ipcRenderer.invoke('ohm:terminate-roblox', pid),
  setTopmost: value => ipcRenderer.invoke('ohm:set-topmost', value),
  platform: process.platform
});
