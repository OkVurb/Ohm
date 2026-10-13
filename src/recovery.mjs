export function snapshotDrafts(tabs, activeId) {
  const drafts = tabs.filter(tab => tab.dirty).map(tab => ({
    id: tab.id,
    name: tab.path ? tab.path.split(/[\\/]/).pop() : tab.name,
    content: tab.model.getValue()
  }));
  return { version: 1, drafts, activeId: drafts.some(tab => tab.id === activeId) ? activeId : null };
}

export function createDraftRecovery({ snapshot, save, onSaved = () => {}, onError = () => {}, delay = 500 }) {
  let timer;
  let writing;
  let changed = false;
  let paused = false;

  async function flush() {
    clearTimeout(timer);
    timer = null;
    if (writing) await writing;
    if (paused || !changed) return;
    changed = false;
    writing = Promise.resolve().then(() => save(snapshot()));
    try { await writing; onSaved(); }
    catch (error) { changed = true; throw error; }
    finally { writing = null; }
    if (changed && !paused) await flush();
  }

  function schedule() {
    changed = true;
    if (!timer && !paused) timer = setTimeout(() => flush().catch(onError), delay);
  }

  return {
    schedule,
    flush,
    get pending() { return changed || Boolean(writing); },
    async pause() {
      paused = true;
      clearTimeout(timer);
      timer = null;
      await writing?.catch(() => {});
    },
    resume() { paused = false; if (changed) schedule(); }
  };
}
