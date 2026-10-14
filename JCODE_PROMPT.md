# Jcode continuation prompt

Work in C:\Users\cr0od\OneDrive\Documents\GitHub\Ohm on Windows.
Use small, sequential steps: read one relevant file, make one exact edit, then
check it. Use the real tool schemas. Do not invent tools or output XML tool calls.

First run git status and inspect the current branch. Read the repair update at
the top of CODE_REVIEW.md, then HANDOFF.md. Older sections are historical, not
proof that the current build or native backend works.

Keep all three injector source files. Do not delete them or silently replace
the intended live Player feature with offline execution. The JavaScript bridge
now loads correctly, but no native backend is configured. Preserve that honest
unavailable status. Do not fabricate backend exports, drivers or success results.
Do not implement anti-cheat bypasses. No Roblox Studio migration is requested.

Already fixed:
- Injector import path, browser-global startup crashes and missing class export.
- Missing packaged bridge modules and false success after backend rejection.
- Saving older text incorrectly marking newer edits clean.
- Duplicate save dialogs, save completion stealing focus and closing a saving tab.
- Concurrent temporary-file collisions and save reordering during path checks.
- Normal window closure silently discarding unsaved edits.

Also completed in version 0.1.3:
- Local draft checkpoints, validated recovery files and corrupt-data preservation.
- Pathless restored tabs so recovery never silently overwrites original files.
- Native close handshake with keep/cancel/discard and write-failure handling.
- Single-instance profile protection.
- Autoexec filename dialog, reserved-name rejection, replacement confirmation,
  and open/edit/save of stored scripts.
- Ordered settings writes, workspace persistence errors, settings cancel fix,
  stale sidebar response protection and bounded output.

Verified: npm run check passes with 21 Node regression tests, existing core/Luau
checks and the production build. npm run smoke tests the unpacked Windows app,
including abrupt-exit recovery and close/cancel/keep/discard across restarts.
Native dialog selections are simulated only in that isolated test process.
The app, renderer, close event and disk writes are real. Results are under
release/reliability-verification. Read CODE_REVIEW.md for limitations.

Remaining work is not a blank check to invent implementations:
- No compatible native backend/provider contract exists in this checkout.
  Live Player execution is still missing. Renaming offline to online cannot add it.
- The preserved nodeinject prototype still has syntax/native-helper defects;
  driver declarations are not implemented. Do not claim these are verified.
- Autoexec execution, account services, remote updates and instance grouping
  are absent. Define actual requirements and service contracts before wiring them.
- Signing, clean-machine installer upgrades/uninstalls, accessibility and broader
  failure testing remain release work. No installed copy was changed and no
  new release assets were published during this repair.

Continue with concrete, reproducible application bugs and missing ordinary app
features. Preserve unfinished source and document genuine blockers. Do not claim
all code is finished or production ready. No Roblox Studio migration is requested.

Tool rules:
1. Verify the shell behind Jcode's tool named bash. Prior local evidence showed
   it using cmd.exe, but that may be stale. Alacritty does not determine it.
2. On Windows, use explicit powershell.exe -NoProfile -Command for PowerShell.
   For longer scripts, write a .ps1 file and run powershell.exe -NoProfile -File.
   Do not mix CMD, Bash and PowerShell syntax or paste Bash heredocs into CMD.
3. Use dedicated read/edit tools when available. Read the exact current text
   before editing. Supply every field required by the actual edit schema,
   including exact old_string/new_string or the required edits array.
4. Make one small, unique replacement per call. If it fails, reread that section.
   Do not retry the same malformed call or rewrite a whole file from memory.
5. Run one short command at a time and inspect its exit code. Missing paths and
   invalid syntax are not evidence that administrator access is needed.
6. Run npm run check after changes. Inspect git diff --check before committing.
   Build success is not runtime proof. Test the packaged app separately.

Use the existing draft https://github.com/OkVurb/Ohm/pull/1 for review updates.
The review branch is codex/ohm-greptile-review. Local main contains old oversized
EXE commits. Do not push that ancestry, delete those EXEs, reset user work, or
switch branches blindly. Preserve current edits and inspect branch differences.

Report what changed, which checks actually passed, and what remains unfinished.
