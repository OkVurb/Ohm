export function saveTab(tab, api) {
  // Share the pending operation so repeated shortcuts cannot open multiple dialogs.
  if (tab.saving) return tab.saving;
  const operation = (async () => {
    const content = tab.model.getValue();
    const version = tab.model.getVersionId();
    const file = tab.path ? await api.saveFile(tab.path, content) : await api.saveAs(tab.name, content);
    if (!file) return false;
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
