const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');

const maxRecoveryBytes = 8 * 1024 * 1024;
const emptyRecovery = () => ({ version: 1, drafts: [], activeId: null });

function cleanRecovery(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.drafts) || value.drafts.length > 50) {
    throw new TypeError('Draft recovery supports up to 50 unsaved scripts');
  }
  const ids = new Set();
  const drafts = value.drafts.map(draft => {
    if (!draft || typeof draft.id !== 'string' || !draft.id || draft.id.length > 80 || ids.has(draft.id) ||
        typeof draft.name !== 'string' || !draft.name || draft.name.length > 255 || /[\\/\x00-\x1f]/.test(draft.name) ||
        typeof draft.content !== 'string' || Buffer.byteLength(draft.content, 'utf8') > 2 * 1024 * 1024) {
      throw new TypeError('Invalid recovery draft or script exceeds 2 MB');
    }
    ids.add(draft.id);
    // Recovery never grants permission to overwrite a path from a previous session.
    return { id: draft.id, name: draft.name, content: draft.content };
  });
  const result = { version: 1, drafts, activeId: ids.has(value.activeId) ? value.activeId : null };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > maxRecoveryBytes) {
    throw new RangeError('Recovery drafts exceed 8 MB. Save some scripts to files.');
  }
  return result;
}

async function loadRecovery(file) {
  let info;
  try { info = await fs.lstat(file); }
  catch (error) {
    if (error.code === 'ENOENT') return { session: emptyRecovery(), warning: null };
    throw error;
  }
  if (!info.isFile()) throw new Error('The recovery path is not a regular file');
  let session;
  let invalid = info.size > maxRecoveryBytes;
  if (!invalid) {
    const text = await fs.readFile(file, 'utf8');
    try { session = cleanRecovery(JSON.parse(text)); }
    catch { invalid = true; }
  }
  if (!invalid) return { session, warning: null };
  const backup = `${file}.corrupt-${randomUUID()}`;
  await fs.rename(file, backup);
  return { session: emptyRecovery(), warning: `Unreadable drafts were preserved at ${backup}` };
}

module.exports = { cleanRecovery, emptyRecovery, loadRecovery };
