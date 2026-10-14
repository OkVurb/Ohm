# Unfinished injector prototype

These files do not provide working live Roblox execution. They are not connected
to the application or included as an execution backend in the packaged app.

- `injection.js` calls `window.ohm.injectRoblox` and `window.ohm.uninjectRoblox`,
  neither of which exists in the preload bridge. Its `log` helper is also missing.
- `electron/injector.cjs` does not exist. The separate `electron/nodeinject.js`
  prototype references an absent `inject32.exe` and has no script execution API.
- `driver/driver.h` contains declarations only. No driver implementation or build
  project is present.

A live backend needs an implemented, documented connection and script execution
interface, plus runtime verification. The local Luau runner remains a separate
offline capability; renaming it does not connect it to Roblox.
