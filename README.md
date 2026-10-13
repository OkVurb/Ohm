<img width="1254" height="1254" alt="ohm-icon" src="https://github.com/user-attachments/assets/e50f273b-2836-4ae0-8150-91c3bf17a351" />

# Ohm

> Review snapshot (2026-10-13): current injector changes introduce startup
> blockers. See [CODE_REVIEW.md](CODE_REVIEW.md). The capabilities and historical
> 0.1.2 repair described below do not establish that this snapshot starts.

Ohm is an independent Windows desktop workspace for Luau scripts. It has no account, subscription, license key, or hardware ID system.

## What works

- Monaco based Luau editor with multiple tabs, syntax highlighting, and unsaved change prompts.
- Open, edit, and save local scripts. Choose a workspace folder and reopen it on the next launch.
- Store and delete local autoexec scripts. These are file storage only.
- Dark and light themes, font size, word wrap, and always on top.
- Detect Roblox Player processes, launch a selected Roblox executable, and end a selected process after confirmation.
- Windows installer and portable executable with the Ohm Ω icon.
- Run the active editor buffer locally using the official Luau command line runtime. Output and errors appear in Ohm.

## Current limits

The Run offline button executes Luau in a separate local process. It does not connect to Roblox Player or provide Roblox APIs such as `game` and `workspace`. Runs stop after five seconds, and output is limited to one megabyte. Ohm bundles the official Luau 0.742 Windows executable under its MIT license. The installed Volt files did not include `Emulator.dll` or `Executor.dll`. `volt.bin` was found in Roblox version folders, but its role is unverified, so it is not copied into Ohm or published here. The recovered Volt assets and user data are not included in this repository.

Ohm also does not implement Volt's account services, remote updates, or instance grouping.

## Develop and build

Requires Node.js on Windows.

```powershell
npm ci
npm run check
npm run dist
```

Build outputs are written to `release/`. `Ohm-Setup` is the installer and `Ohm-Portable` runs without installation. Local settings and the default workspace are stored under the app's user data folder.

`npm run dist` runs the checks before packaging. Version 0.1.2 fixes the startup
crash caused by exporting an undefined `runOffline` after the function was renamed.
Use the newly built 0.1.2 files in `release/`; the older 0.1.1 executables in the
repository root and an existing installation are not updated by building.
This repair restores the local runner. It does not add live Roblox execution.
