const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ohm', {
  init: () => ipcRenderer.invoke('ohm:init'),
  openFiles: () => ipcRenderer.invoke('ohm:open-files'),
  readFile: path => ipcRenderer.invoke('ohm:read-file', path),
  saveFile: (path, content) => ipcRenderer.invoke('ohm:save-file', path, content),
  saveAs: (name, content) => ipcRenderer.invoke('ohm:save-as', name, content),
  listWorkspace: () => ipcRenderer.invoke('ohm:list-workspace'),
  chooseWorkspace: () => ipcRenderer.invoke('ohm:choose-workspace'),
  getSettings: () => ipcRenderer.invoke('ohm:get-settings'),
  setSettings: patch => ipcRenderer.invoke('ohm:set-settings', patch),
  listAutoexec: () => ipcRenderer.invoke('ohm:list-autoexec'),
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
