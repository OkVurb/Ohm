const path = require('node:path');

const defaults = Object.freeze({ theme: 'dark', fontSize: 14, wordWrap: false, alwaysOnTop: false, robloxPath: '' });

function cleanSettings(input, previous = defaults) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid settings');
  const next = { ...previous };
  for (const [key, value] of Object.entries(input)) {
    if (key === 'theme' && ['dark', 'light'].includes(value)) next.theme = value;
    else if (key === 'fontSize' && Number.isInteger(value) && value >= 10 && value <= 28) next.fontSize = value;
    else if (key === 'wordWrap' && typeof value === 'boolean') next.wordWrap = value;
    else if (key === 'alwaysOnTop' && typeof value === 'boolean') next.alwaysOnTop = value;
    else if (key === 'robloxPath' && typeof value === 'string' && value.length < 1024) next.robloxPath = value;
    else throw new TypeError(`Invalid setting: ${key}`);
  }
  return next;
}

function autoexecName(name) {
  if (typeof name !== 'string' || !/^[a-zA-Z0-9 _.-]{1,80}\.lua$/i.test(name) || name.startsWith('.')) {
    throw new TypeError('Use a .lua filename without folders');
  }
  return name;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

module.exports = { defaults, cleanSettings, autoexecName, inside };
"module.exports = { injectDllToPid }" 
"module.exports = { runOffline, injectDllToPid }" 
