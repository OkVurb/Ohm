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

Verified: npm run check passes, including nine regression tests and the build.
The unpacked Windows app passed startup, local output 42, syntax-error reporting,
concurrent saves and the renderer close guard. Native dialog choices were unit
tested. Native/live execution was not tested. Crash recovery remains absent.
The separate nodeinject prototype still has known syntax/native-helper defects
and was preserved unchanged. No new installer was installed or published.

Your next work is ordinary application reliability: inspect remaining findings,
add recoverable drafts, test close/cancel/save behavior, and improve error handling.
Do not describe the whole product as production ready while those gaps remain.

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
