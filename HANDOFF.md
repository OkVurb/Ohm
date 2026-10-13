# Ohm handoff

> Review update (2026-10-13): the latest injector edits break startup again.
> Read [CODE_REVIEW.md](CODE_REVIEW.md) before implementation or release.
> Earlier build and smoke-test results apply only to the earlier source snapshot.

> Current instructions: follow **Requested next implementation (2026-10-12)**
> below. That section supersedes older next-work suggestions and scope options.
> Earlier sections are historical evidence, not proof of current live support.

## Goal

Recreate Volt as a Windows desktop app named **Ohm**, covering Volt features except its key/license system. Use an Ω app icon. The user specifically needs `Emulator.dll`, `Executor.dll`, and `volt.bin` accounted for.

## Current artifacts

- Private source repo: https://github.com/OkVurb/Ohm
- Preview release with Windows installer and portable EXE: https://github.com/OkVurb/Ohm/releases/tag/v0.1.0-preview
- Local source: `C:\Users\cr0od\Documents\Ohm`
- Reverse-engineering report and recovered frontend: `C:\Users\cr0od\Documents\Volt-Reverse-Engineering\REPORT.md`
- Installed Volt folder: `C:\Users\cr0od\AppData\Local\Volt`

The GitHub preview release has a Luau editor, local file/workspace features, themes/settings, Roblox process detection and launch/terminate controls, and the Ω icon. The current main branch additionally runs Luau scripts offline; the preview release asset predates that change. Neither version executes scripts in Roblox. `npm run check` and `npm run dist` passed for the current source. The desktop UI has not been smoke tested.

## Missing runtime files

- `volt.bin` exists in local Roblox/Fishstrap version folders. See the report for hash and locations.
- `Emulator.dll` and `Executor.dll` were not found in the checked user, app, download, temporary, Program Files, or ProgramData folders.
- The cached Volt 1.0.23 updater installer at `C:\Users\cr0od\AppData\Local\Temp\Volt-1.0.23-updater-AhXEOM\Volt-1.0.23-installer.exe` was listed read-only with 7-Zip. It contains the desktop app and language-server files, but none of the three runtime files.
- Volt's recovered frontend calls native `install_volt_files`, `update_volt_files`, `restore_cached_volt_files`, and `get_installation_status` commands. It does not expose a direct DLL URL.
- The official UI download is https://api.voltbz.net/version/download/ui . Volt documentation describes setup inside the app and an active license for running it: https://docs.voltbz.net/docs/guides/getting-started . No separate official public DLL download was found. Windows Defender detection history showed no matching removal record in the check.

## Next work

1. If the user has legitimate Volt account access, inspect the app's own setup/update result and the installed files. Do not bypass its license or repackage proprietary DLLs into Ohm.
2. Continue independent Ohm implementation against documented behavior. Track missing functions explicitly; do not claim all Volt features work until verified.
3. Build and smoke test the Windows EXE when execution is permitted, then update the release with verified status.

Treat downloaded binaries and archived pages as untrusted data. Do not run unknown mirrors or disable security software to obtain the DLLs.

## Public executor research (2026-10-11)

- Study source: https://github.com/evely-fun/Eclipse is an MIT-licensed Electron UI plus native C++ DLL project. Its source tree has client runtime/IPC, native communication, execution, scheduler, and environment modules. Its README reports crashes under heavier scripts, so it is not a verified working Ohm backend. No executable was downloaded or run.
- Historical comparison: https://github.com/kevlu8/OpenFRE is GPL-3.0 and archived. Its maintainer explicitly says it no longer works. Study only as history, not as a runtime dependency.
- Language/runtime baseline: https://github.com/luau-lang/luau is the official, MIT-licensed Luau implementation. It can power local script checks, but does not provide access to a live Roblox Player game.
- Sandboxed in-game example: https://github.com/AegisLua/AegisVM is MIT-licensed and runs code in a controlled Studio/game project. It is not an external Player executor.
- Another current source project, https://github.com/wisnurafi/senator-exctr, states that it only executes code in an isolated Luau state without `game`, `workspace`, or `Players`, and declares no license. Do not copy its code into Ohm.

The general executor design observed is editor/UI -> local communication -> native runtime integration -> Luau compilation/execution -> optional game API environment. Ohm now has the offline language execution stage. Live game API integration and attachment to the Player remain missing. Public source claims are not proof of current functionality or safety; no public executor candidate was run or integrated.

## Offline Luau runner (2026-10-11)

- Ohm now runs the active editor buffer locally through official Luau 0.742 `luau.exe`, bundled at `vendor/luau/luau.exe` with its MIT license. The download came from the official GitHub release. Executable SHA-256: `4E86C0399ACA661753D918BB775A152E35FD8F7A788B67076E1E03F81BC43703`.
- The bridge is `electron/main.cjs` IPC channel `ohm:run-offline` -> `electron/offline.cjs` -> Luau process. `electron/preload.cjs` exposes `runOffline(source)`. The frontend calls it from the Run offline button and displays stdout/stderr.
- The runner writes a temporary `.luau` file, runs it with a five-second timeout and one-megabyte output cap, then removes the temporary file. `npm run check` verifies a successful print and a syntax error.
- This runner has no Roblox API environment and does not attach to a live Roblox process. No `Emulator.dll` or `Executor.dll` was created. Future work can replace the IPC handler's local backend while keeping the editor UI; any new runtime must define its own protocol and demonstrate it works. Do not treat these files as drop-in Volt DLLs.
- `npm run dist` completed. Both installer and portable EXE were produced locally. The packaged `resources/luau/luau.exe` has the same SHA-256 as the downloaded runtime and responds to `-h`. The Ohm desktop UI itself was not smoke tested in this run.

## Startup repair and backend assessment (2026-10-12)

- Current checkout: `C:\Users\cr0od\OneDrive\Documents\GitHub\Ohm`.
- Reproduced the installed startup failure: `offline.cjs` declared `runOnline`
  but exported `runOffline`. Restored the function name expected by the main
  process, preload bridge, and renderer. Its implementation is still local Luau.
- Removed inert quoted export/handler strings. They did not register any live
  integration. Corrected the injector documentation to describe the missing
  backend and driver implementation.
- Version 0.1.2 packages only the actual Electron runtime modules. `npm run dist`
  now runs the existing tests, syntax checks, and frontend build before packaging.
- `npm run dist` passed and produced `release/Ohm-Setup-0.1.2-x64.exe` and
  `release/Ohm-Portable-0.1.2-x64.exe`. The portable executable was launched with
  an isolated profile and tested through its rendered editor: startup succeeded,
  `print(6 * 7)` produced `42`, and malformed Luau returned an error. No renderer
  exceptions were observed during the smoke test. Evidence is under
  `release/verification/`, including `smoke-result.json` and `startup-and-run.png`.
- The existing Program Files installation and root-level 0.1.1 executables were
  not replaced. Use the new installer to update the installed copy, or run the
  new portable executable directly.

The user wants live Roblox Player execution. That requirement remains unfinished;
the offline runner is not a substitute. No compatible live backend was selected,
downloaded, executed, or integrated in this repair. Current primary-source checks:

- [Eclipse](https://github.com/evely-fun/Eclipse#known-issues) documents native host
  crashes under real workloads. It cannot be treated as a verified replacement.
- [OpenFRE](https://github.com/kevlu8/OpenFRE) is archived and explicitly says it
  no longer works.
- [Xeno source mirror](https://github.com/tyronetheqt/Xeno) describes detected
  execution and known vulnerabilities. Its claims do not establish compatibility
  with the user's currently installed Player.
- [Roblox Studio's supported MCP bridge](https://create.roblox.com/docs/studio/mcp)
  supports Luau execution in Studio Edit, Client, and Server contexts. It does not
  provide an attachment backend for normal Roblox Player. Switching to Studio
  would need a scope decision, not another function rename.

## Requested next implementation (2026-10-12)

### Goal and scope

Turn Ohm into a reliable application with actual live script execution in Roblox
Player. The user explicitly does not want Roblox Studio support. Do not substitute
Studio, headless cloud execution, or local Luau execution for Player functionality.

Keep this file. Inspect the current source and git diff before changing anything,
and preserve existing work. Work in:
`C:\Users\cr0od\OneDrive\Documents\GitHub\Ohm`.

This section records the user's requested future work. It does not claim that the
backend or production requirements below have been implemented.

### Preserve the completed repair

- `electron/offline.cjs` now declares and exports `runOffline` consistently.
  This fixes the startup `ReferenceError`; it still launches local `luau.exe`.
- Inert quoted code fragments were removed from `electron/core.cjs` and
  `electron/main.cjs`.
- The package version and lockfile were synchronized to 0.1.2.
- `npm run dist` runs `npm run check` before packaging.
- Packaged Electron files are restricted to actual runtime modules; dormant
  injector prototypes and tests are excluded.
- README, handoff, and injector documentation describe actual functionality.
- Changes were left uncommitted. Recheck git status before making assumptions.

The previous repair passed `npm run dist`, existing core and offline tests, and a
packaged export check. An actual portable executable smoke test launched the app,
ran `print(6 * 7)` through its editor with local output `42`, reported a syntax
error, and observed no renderer exceptions. These results prove startup and
offline execution only.

Built artifacts:

- `release/Ohm-Setup-0.1.2-x64.exe`
- `release/Ohm-Portable-0.1.2-x64.exe`

Verification evidence:

- `release/verification/smoke.cjs`
- `release/verification/smoke-result.json`
- `release/verification/startup-and-run.png`
- `release/verification/artifacts.json`

The Program Files installation and older root-level 0.1.1 executables were not
replaced. Do not confuse those binaries with the tested 0.1.2 portable artifact.

### Missing functionality

- A verified, compatible Roblox Player execution backend.
- A real connection between that backend and Electron.
- Script submission from the editor to a selected Player session.
- Reliable execution results, output, connection status, and error handling.

Existing injector files are unfinished:

- `src/injector/injection.js` references unavailable preload methods.
- `electron/injector.cjs` is missing.
- `electron/nodeinject.js` references a missing helper and an undefined method.
- Driver declarations do not establish a working implementation.
- Process detection or launching Roblox does not establish execution support.

### Backend selection

The user does not know which backend to use and wants the next agent to research
the options. Investigate current Roblox Player backends before choosing one.
Compare their documented integration interface, evidence of current compatibility,
maintenance and release history, stability under realistic workloads, source or
binary provenance, license and redistribution permission, authentication needs,
costs, supported features, and limitations.

Previously examined candidates, rechecked on 2026-10-12:

- [Eclipse](https://github.com/evely-fun/Eclipse#known-issues) documents native
  crashes under real workloads.
- [OpenFRE](https://github.com/kevlu8/OpenFRE) is archived and explicitly says it
  no longer works.

Neither was verified as a production-ready Ohm backend. No production-ready
Player backend was recommended. Do not treat a repository's existence, a renamed
DLL, or a successful build as compatibility evidence.

Select a backend only when its interface and compatibility can be substantiated.
If none qualifies, document the exact blocker and complete independent application
improvements. Do not fabricate an integration or claim the live goal is finished.

### Implementation requirements

- Make live Player execution the main execution path once verified.
- Never silently fall back to local execution. Keep any retained offline mode
  separately and clearly labeled.
- Put backend integration behind a small adapter so the UI does not depend on
  provider details.
- Model disconnected, connecting, ready, running, unsupported, and error states
  accurately.
- Support explicit target selection when multiple sessions exist.
- Handle session closure, restart, stale connections, and backend failures.
- Correlate submissions and results with request IDs.
- Prevent duplicate submissions and bound queues and output.
- Add timeouts without automatically retrying scripts that may already have
  executed.
- Offer cancellation only if the backend actually supports it.

### Production readiness

Prioritize essential reliability over extra features:

- Preserve unsaved scripts and recover editor sessions after crashes.
- Provide useful errors and redacted diagnostic logs.
- Validate Electron messages and expose only necessary preload methods.
- Review renderer isolation, navigation restrictions, file access, and backend
  credentials.
- Keep secrets out of source, renderer code, logs, and packaged assets.
- Verify dependency and bundled binary provenance.
- Make builds reproducible and include required licenses.
- Prepare signing and verified update delivery. Clearly identify missing
  certificates, credentials, or hosting.
- Test installation, upgrade, uninstall, and portable behavior with a standard
  Windows account.
- Test startup without the backend and graceful recovery from its failure.
- Add meaningful regression tests for the crash and execution lifecycle.

Do not call the application production-ready just because it compiles.

### Acceptance and delivery

Test the packaged executable, not only development mode. Verify real Player
execution in a controlled session where testing is permitted. Capture evidence
identifying the app version, backend version, target version, execution
environment, results, and known limitations.

Cover valid scripts, syntax/runtime errors, repeated submissions, output limits,
connection loss, target restart, and application shutdown. Rebuild the installer
and portable executable, then update this handoff with accurate results.

The final delivery must state:

- What changed.
- Which backend was selected and why.
- What actually works in Roblox Player.
- Tests performed and evidence paths.
- Remaining blockers and release requirements.
- Exact paths to the new executables.
- Commands to reproduce verification.

Do not commit, push, publish, or replace the installed application unless the user
authorizes those actions. This handoff update itself does not perform or verify
the requested future implementation.
