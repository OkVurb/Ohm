# Ohm handoff

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
