const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const pending = new Map();

function writeAtomic(file, value) {
  const absolute = path.resolve(file);
  const key = process.platform === 'win32' ? absolute.toLowerCase() : absolute;
  const previous = pending.get(key) || Promise.resolve();
  const write = previous.catch(() => {}).then(async () => {
    const temp = `${absolute}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp, value, { encoding: 'utf8', flag: 'wx' });
      await fs.rename(temp, absolute);
    } finally {
      await fs.unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  });
  pending.set(key, write);
  const clear = () => { if (pending.get(key) === write) pending.delete(key); };
  write.then(clear, clear);
  return write;
}

module.exports = { writeAtomic };
