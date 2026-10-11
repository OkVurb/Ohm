# Ohm

Ohm is an independent Windows desktop workspace for Luau scripts. It has no account, subscription, license key, or hardware ID system.

## What works

- Monaco based Luau editor with multiple tabs, syntax highlighting, and unsaved change prompts.
- Open, edit, and save local scripts. Choose a workspace folder and reopen it on the next launch.
- Store and delete local autoexec scripts. These are file storage only.
- Dark and light themes, font size, word wrap, and always on top.
- Detect Roblox Player processes, launch a selected Roblox executable, and end a selected process after confirmation.
- Windows installer and portable executable with the Ohm Ω icon.

## Current limits

Ohm does not execute scripts in Roblox Player. The installed Volt files did not include `Emulator.dll` or `Executor.dll`. `volt.bin` was found in Roblox version folders, but its role is unverified, so it is not copied into Ohm or published here. The recovered Volt assets and user data are not included in this repository.

Ohm also does not implement Volt's account services, remote updates, or instance grouping. The Run button clearly reports that execution is unavailable.

## Develop and build

Requires Node.js on Windows.

```powershell
npm ci
npm run check
npm run dist
```

Build outputs are written to `release/`. `Ohm-Setup` is the installer and `Ohm-Portable` runs without installation. Local settings and the default workspace are stored under the app's user data folder.
