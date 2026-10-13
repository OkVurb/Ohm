const assert = require('node:assert/strict');
const path = require('node:path');
const { defaults, cleanSettings, autoexecName, inside } = require('./core.cjs');

assert.equal(cleanSettings({ fontSize: 18 }).fontSize, 18);
assert.equal(cleanSettings({}).theme, defaults.theme);
assert.throws(() => cleanSettings({ fontSize: 100 }));
assert.throws(() => cleanSettings({ unknown: true }));
assert.equal(autoexecName('farm.lua'), 'farm.lua');
assert.equal(autoexecName('my-script.luau'), 'my-script.luau');
for (const name of ['_startup.lua', '-startup.lua', ' startup.lua']) assert.equal(autoexecName(name), name);
for (const name of ['CON.lua', 'com1.other.lua', 'LPT9 .lua', '.hidden.lua', 'a.lua.', 'x/y.lua', 'x\\y.lua']) {
  assert.throws(() => autoexecName(name), undefined, name);
}
assert.throws(() => autoexecName('../escape.lua'));
const root = path.resolve('C:/workspace');
assert.equal(inside(root, path.join(root, 'a.lua')), true);
assert.equal(inside(root, path.resolve('C:/workspace-old/a.lua')), false);
console.log('core checks passed');
