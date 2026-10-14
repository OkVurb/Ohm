<img width="1254" height="1254" alt="ohm-icon" src="https://github.com/user-attachments/assets/e50f273b-2836-4ae0-8150-91c3bf17a351" />

# Ohm

> Version 0.1.3 repairs startup, adds local draft recovery, and fixes editor,
> settings and autoexec storage reliability. Live Player execution remains
> unavailable. See [CODE_REVIEW.md](CODE_REVIEW.md) for verification and limits.

Ohm is an independent Windows desktop workspace for Luau scripts. It has no account, subscription, license key, or hardware ID system.

## What works

- Monaco based Luau editor with multiple tabs, syntax highlighting, and unsaved change prompts.
- Open, edit, and save local scripts. Choose a workspace folder and reopen it on the next launch.
- Save, open, edit and delete local autoexec scripts with filename validation and replacement confirmation. These are file storage only.
- Recover unsaved drafts after restart. Closing offers keep editing, keep drafts or discard.
- Dark and light themes, font size, word wrap, and always on top.
- Detect Roblox Player processes, launch a selected Roblox executable, and end a selected process after confirmation.
- Windows installer and portable executable with the Ohm Ω icon.
- Run the active editor buffer locally using the official Luau command line runtime. Output and errors appear in Ohm.

## Current limits

The Run offline button executes Luau in a separate local process. It does not connect to Roblox Player or provide Roblox APIs such as `game` and `workspace`. Runs stop after five seconds, and output is limited to one megabyte. Ohm bundles the official Luau 0.742 Windows executable under its MIT license. The installed Volt files did not include `Emulator.dll` or `Executor.dll`. `volt.bin` was found in Roblox version folders, but its role is unverified, so it is not copied into Ohm or published here. The recovered Volt assets and user data are not included in this repository.

Ohm also does not implement Volt's account services, remote updates, or instance grouping.

## Develop and build

Requires Node.js 22.12 or newer on Windows.

```powershell
npm ci
npm run check
npm run dist
```

Build outputs are written to `release/`. `Ohm-Setup` is the installer and `Ohm-Portable` runs without installation. Local settings and the default workspace are stored under the app's user data folder.

`npm run dist` runs checks before packaging. Version 0.1.3 includes the startup
repair for the undefined `runOffline` export and subsequent reliability fixes.
Building does not update an existing installation or the older root-level EXEs.
The locally verified 0.1.3 build is under `release/reliability-check/`. Its installer
and portable executable are unsigned. Smoke verification covers the unpacked app;
installer lifecycle and the portable wrapper were not exercised.

## Draft recovery

Unsaved buffers are checkpointed locally about every 500 ms. The latest completed
checkpoint is restored as unsaved tabs, without granting access to original paths.
Save recovered tabs to files when ready. A crash can lose edits made after the
last completed checkpoint; recovery is not a backup or a power-loss guarantee.
Recovery supports 50 drafts, 2 MB per script and 8 MB total. Failures appear in
the status bar. Corrupt recovery data is preserved in a separate local file.

## Packaged verification

Requires Windows and Node.js 22.12 or newer. Build the unpacked app first:

```powershell
npm run check
npx electron-builder --win --dir --config.directories.output=release/reliability-check
npm run smoke
```

The smoke check launches isolated profiles and tests local execution, autoexec
editing, settings persistence, concurrent saves, crash recovery and close choices.
Native dialog responses are simulated only inside the test process; the packaged
renderer, main process and file writes are real. Results and a screenshot are
saved under `release/reliability-verification/`. A different unpacked executable
can be supplied with `npm run smoke -- "C:\path\to\Ohm.exe"`.
