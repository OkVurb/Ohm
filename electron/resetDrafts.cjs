const { emptyRecovery } = require('./recovery.cjs');

// Produce the empty snapshot that saveRecovery persists after drafts are cleared.
// Preservation notices live on the separate recovery.warning property.
function resetDrafts() {
  return emptyRecovery();
}

module.exports = { resetDrafts };
