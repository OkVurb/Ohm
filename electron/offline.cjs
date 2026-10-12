const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function runOnline(source, executable) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'ohm-luau-'));
  const file = path.join(folder, 'script.luau');
  try {
    await fs.writeFile(file, source, 'utf8');
    return await new Promise(resolve => {
      execFile(executable, [file], { cwd: folder, timeout: 5000, maxBuffer: 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
        resolve({ ok: !error, stdout, stderr: stderr || (error ? error.message : '') });
      });
    });
  } finally {
    await fs.unlink(file).catch(() => {});
    await fs.rmdir(folder);
  }
}

module.exports = { runOffline };
