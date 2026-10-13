# Ohm source review

## Repair update (2026-10-13)

The startup and editor fixes below supersede the original findings where noted.
The injector source files are preserved. The Electron bridge now imports from the
correct path, has explicit helper bindings and one instance, and can load without
browser globals. Its renderer class has a CommonJS export and rejects negative
backend results instead of reporting success. Both bridge files are packaged.

The native execution backend is still absent. The launch-with-injection channel
returns `BACKEND_UNAVAILABLE` instead of throwing on nonexistent functions. This
is error handling, not completed live injection. Dormant directory-helper bodies
remain prototypes behind the unavailable-backend guard. The separate nodeinject
prototype and driver declarations are preserved unchanged, including their known
limitations. No anti-cheat bypass or native injection implementation was added.

Other repairs:
- Saving checks the model version, deduplicates pending saves, and keeps tab focus.
- Closing a tab during a save is blocked; window closure warns about unsaved work.
- Atomic writes use unique temporary files and serialize writes per destination.
  Save requests are queued before asynchronous path checks to preserve order.
- Regression tests exercise startup, packaging entries, unavailable/rejected
  backend results, save races, cancellation, write failure/retry and close choices.

Validation: `npm run check` passed with nine new regression tests, existing tests,
syntax checks and production build. Vite's existing large-chunk warning remains.
The unpacked Windows application was rebuilt in `release/bugfix-check` and smoke
verified through its packaged renderer. Startup, local output 42, malformed script
error reporting, concurrent file saves and the renderer's close guard passed with
no renderer exceptions. Evidence: `release/bugfix-verification/smoke-result.json`.
The native dialog choices were unit tested; the smoke test dispatches a cancelable
beforeunload event rather than clicking the operating-system dialog.

No crash recovery is implemented. No installed copy was replaced, and no updated
installer or portable distribution was published. Live Player execution remains
unfinished and unverified. This remains a draft, not a production-ready release.

## Original review snapshot

The following findings describe the source before the repair above; their line
numbers and reproduction commands refer to that historical snapshot.

## Scope

Reviewed all handwritten application source, Electron modules, existing tests,
injector prototypes and driver declarations, HTML/CSS, build configuration, and
documentation. Reviewed the lockfile version changes. This was not a source audit
of third-party dependencies or a reverse-engineering audit of bundled binaries.
No live Roblox execution backend was tested or verified.

## Findings

1. **P1: Development and packaged startup are broken by the new import.**
   `electron/main.cjs:9` eagerly requires `./injection`. Its new bridge at
   `electron/injection.js:6` resolves `../../src/injector/injection` outside the
   repository. Directly requiring the bridge reproduces `MODULE_NOT_FOUND`.
   Independently, `package.json:18` excludes the bridge from the packaged file
   list, so the packaged main process cannot resolve `./injection` at all.
   Both failures occur before the main process's startup catch handler. Keep an
   unfinished optional backend out of the startup dependency chain and verify
   every required module exists in the final archive.

2. **P1: Correcting the import path alone cannot make the bridge load.**
   `src/injector/injection.js` installs a browser global and exports no
   `RobloxInjector` constructor. It cannot be required as a main-process module.
   `electron/injection.js:70` also assigns a property on the undeclared identifier
   `injectFromDirectory`; the similarly named object property creates no local
   binding. Other methods use unavailable main-process `window` and undeclared
   `inject`. A documented backend and a valid main/preload/renderer interface are
   still missing. These prototypes do not establish live execution support.

3. **P2: The newly registered launch handler cannot execute successfully.**
   `electron/main.cjs:174` calls `exec.sync`, but Node's `child_process.exec` has
   no such method. At line 182, `injectFromDllDirectory` is not in scope, and the
   subsequent code expects an array although the bridge returns a result object.
   The preload does not expose this channel and the UI still invokes the ordinary
   launch channel. Resolve the API contract and add handler-level tests before
   advertising the new action.

4. **P1: Saving can mark newer, unsaved edits as clean.**
   `src/main.js:117-122` captures the buffer, awaits saving, then clears `dirty`
   without checking whether the model changed. Type while a save is pending and
   the file contains the older text while the tab loses its unsaved marker.
   Closing that tab skips the discard prompt. An isolated harness executing the
   actual `saveActive` function with a delayed save reproduced this mismatch.
   Track the saved model version and only mark matching content clean.

5. **P2: Concurrent writes reuse the same temporary filename.**
   `electron/main.cjs:20-23` names the temporary file using only the destination
   and process ID. Repeated save shortcuts or settings updates can overlap in
   one process. Once both writes finish, the first rename consumes their shared
   temporary file and a subsequent rename can fail with `ENOENT`. A harness
   executing the actual function reproduced this with real filesystem writes
   and a controlled interleaving. Uncontrolled concurrent renames did not
   consistently fail on this Windows filesystem. Serialize writes per target
   and give each attempt a unique temporary path.

6. **P1: Closing the application discards unsaved buffers.**
   `src/main.js:92-104` guards individual tab closure only. Neither the renderer
   nor `electron/main.cjs:81-90,233` guards window/application closure or persists
   editor buffers for recovery. Closing the window bypasses the tab prompt.
   This finding is based on the complete lifecycle code inspection; a current
   application smoke test is blocked by the startup failure above. Add an
   application-close decision and recoverable session storage.

7. **P2: A shipped-in-source prototype does not parse.**
   `electron/nodeinject.js:17` uses reserved word `var` as an arrow parameter.
   `node --check electron/nodeinject.js` fails with `SyntaxError: Unexpected token
   'var'`. This file is dormant and excluded from the current package, so this
   is distinct from the active startup blocker. Remove obsolete code or require
   every maintained JavaScript module to pass syntax checks.

## Verification and limits

- `npm run check` passed the existing core/offline tests, selected syntax checks,
  and Vite production build. Vite reported a large-chunk warning.
- The command does not import the main process, check every JavaScript file, or
  launch the packaged app. Its passing result misses the defects above.
- Direct bridge import failed as expected with `MODULE_NOT_FOUND`.
- Targeted save reproductions confirmed the dirty-state bug and shared temporary
  filename failure. The local harness is under ignored
  `release/verification/review-repros.cjs` and asserts the observed defects.
- The dormant prototype syntax check failed as described above.
- `git diff --check` reported trailing whitespace in the new main-process handler.
- A scan of reviewed text files found no common embedded credential patterns.
  This is a limited pattern scan, not a guarantee that no secrets exist.
- No new installer or portable binary was built from this broken snapshot.
  Earlier build and smoke evidence must not be attributed to this source state.

Repeat the normal checks from the repository root:

```powershell
npm run check
```

Confirm the active bridge load failure without launching Roblox:

```powershell
node -e "require('./electron/injection.js')"
```

Check the dormant prototype:

```powershell
node --check electron/nodeinject.js
```

The review branch preserves the current source changes for independent review.
It does not implement a backend or fix the new findings. Old root-level 0.1.1
executables and their local-only commit history are excluded from this branch;
they remain in the original checkout. Build outputs belong in release assets.
