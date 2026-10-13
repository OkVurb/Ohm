export function saveTab(tab, api) {
  // Share the pending operation so repeated shortcuts cannot open multiple dialogs.
  if (tab.saving) return tab.saving;
  const operation = (async () => {
    const originalPath = tab.path;
    const content = tab.model.getValue();
    const version = tab.model.getVersionId();
    const file = tab.path ? await api.saveFile(tab.path, content) : await api.saveAs(tab.name, content);
    if (!file) return false;
    // A replacement can detach this buffer while its older save is completing.
    if (tab.path !== originalPath) { tab.dirty = true; return true; }
    tab.path = file;
    tab.dirty = tab.model.getVersionId() !== version;
    return true;
  })();
  tab.saving = operation;
  const clear = () => { if (tab.saving === operation) tab.saving = null; };
  operation.then(clear, clear);
  return operation;
}

export function hasUnsavedWork(tabs) {
  return tabs.some(tab => tab.dirty || tab.saving);
}

// Keep modified buffers as unsaved copies when the backing file is replaced.
// Clean tabs can safely adopt the replacement without stealing editor focus.
export function refreshReplacedTabs(tabs, file, platform) {
  const normalize = value => platform === 'win32' ? value?.replaceAll('\\', '/').toLowerCase() : value;
  const preserved = [];
  for (const tab of tabs) {
    if (!tab.path || normalize(tab.path) !== normalize(file.path)) continue;
    if (tab.dirty || tab.saving) {
      tab.name = tab.path.split(/[\\/]/).pop();
      tab.path = null;
      tab.dirty = true;
      preserved.push(tab);
    } else {
      if (tab.model.getValue() !== file.content) tab.model.setValue(file.content);
      tab.dirty = false;
    }
  }
  return preserved;
}
