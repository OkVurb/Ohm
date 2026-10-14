# Ohm source review

## Repair update (2026-10-13, version 0.1.3)

The changes below supersede the original findings where noted. All injector
source files are retained. The Electron bridge loads from the correct path,
uses explicit bindings and one instance, and no longer requires browser globals.
The renderer class has a CommonJS export. Negative backend results stay failures,
and both bridge modules are packaged.

Completed application repairs:
- Saves preserve newer edits, deduplicate pending requests and retain tab focus.
  Atomic writes use unique temporary files and serialize each destination.
- Draft checkpoints restore dirty buffers as pathless unsaved tabs after restart.
  Invalid recovery data is preserved separately. Size/count limits are enforced.
- Native window closure waits for the renderer and pending writes. Users can keep
  editing, keep drafts, or discard. Failed recovery writes keep the window open
  unless the user explicitly chooses to close without recovery.
- Single-instance startup prevents two normal launches sharing the profile.
- Autoexec storage uses an HTML filename dialog, validates Windows names,
  confirms replacement and opens saved scripts in editable tabs.
- Settings and workspace changes only become active after successful writes.
  Settings updates are queued. Canceling settings no longer reapplies stale values.
- Sidebar responses cannot overwrite a newer selected view. Output is bounded.

Validation: `npm run check` passed with 21 Node regression tests, existing core
and real Luau checks, syntax checks and the production build. The existing Vite
large-chunk warning remains. `npm run smoke` passed against the unpacked Windows
app in `release/reliability-check/win-unpacked/Ohm.exe`: startup, local output 42,
syntax-error reporting, autoexec save/open/edit, settings save/cancel/restart,
latest sidebar response, concurrent saves, abrupt-exit recovery and native
close/cancel/keep/discard all passed. No renderer exceptions were observed.
Evidence: `release/reliability-verification/smoke-result.json` and
`recovered-drafts.png`. Native dialog selections are simulated only in the test
process; the actual packaged app, close event, renderer and file writes are used.
Disk-write failures and corrupt recovery files have separate regression coverage.

Remaining limits:
- No native execution backend is configured. The injection launch channel returns
  `BACKEND_UNAVAILABLE`; this is not live Player execution. The separate nodeinject
  prototype has known syntax/native-helper defects and driver declarations lack
  implementations. These sources were preserved, not completed or validated.
- Autoexec files are stored and editable but do not execute automatically.
- Account services, remote updates and instance grouping remain unimplemented.
- Recovery cannot guarantee the last uncheckpointed edits after a crash or power
  loss. It supports 50 drafts, 2 MB each and 8 MB total.
- The 0.1.3 installer and portable executable were built locally in
  `release/reliability-check/`. Both are unsigned. Installer upgrade/uninstall
  behavior and the portable wrapper itself were not smoke tested.
  No installed copy was replaced and no GitHub release assets were published.

This remains a draft. The completed reliability work does not make the whole
product production ready or satisfy the requested live execution feature.

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
