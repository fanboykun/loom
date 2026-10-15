# Loom — Multi-Tab Integrated Terminal

Status: implementation specification. Inspect current runtime and terminal components first. No repository changes are implied by this document.

## 1. Scope

Add a real interactive terminal panel inspired by the supplied screenshot. Required toolbar actions are ONLY:
- New tab (+).
- Restart active terminal.

Each tab owns an independent shell/PTY session. Switching tabs does not restart shells. No split panes, attach-to-agent console, shell picker, downloads or command automation in this milestone.

Reuse existing shared panel close/expand controls if available. Hiding/closing the panel is not termination. Do not add tab-close buttons unless separately requested; a user may exit a shell with its normal exit command. Exited tabs remain visible and may be restarted.

## 2. Architecture

Renderer: existing Svelte application + @xterm/xterm and @xterm/addon-fit.
Backend: TerminalManager controlling real pseudo-terminals via a supported PTY implementation.
Transport: typed messages over authenticated WebSocket for web; a transport abstraction can support desktop IPC later.

xterm.js renders/emulates a terminal; it is not the shell. PTY backend runs the user's shell. Plain stdout pipes are not an adequate substitute for interactive terminal semantics.

Do not assume node-pty native bindings work in the current Bun runtime or packaged binary. Run an explicit compatibility spike on supported OS/runtime combinations. If needed, use a dedicated Node PTY host with authenticated framed IPC. Node compatibility and packaging must be demonstrated before committing architecture. Do not silently require an undeclared Node installation from end users.

## 3. Workspace and permissions

Resolve project/workspace from trusted IDs server-side. Do not accept an arbitrary browser-supplied cwd, executable or environment map.

New terminals start at the selected project root or explicitly selected task worktree. Show the scope in the panel/tab tooltip. Changing project does not retarget existing shells. Filter sessions by context and prevent cross-project attachment.

A terminal provides user-level shell capabilities, not sandboxed project access. cwd only chooses the starting directory; users can navigate elsewhere under OS permissions. Warn on first use and respect local application policy. Do not describe workspace path validation as confinement.

Never launch shells elevated by default. Do not inject agent credentials or Loom control tokens into shell environment. Inherit only environment needed for a usable user shell according to documented host policy, preserving PATH, locale and home as appropriate. Secrets may already exist in the user's shell environment; do not claim the application can erase all risk.

User terminal sessions are distinct from orchestrator provider processes. Agents must not write commands into these sessions automatically. Restarting a terminal never aborts a coding agent or task run.

## 4. UI

Panel heading: Terminal.
Tab strip: Terminal 1, Terminal 2, ... plus only New tab and Restart controls.

- New tab creates and activates one independent terminal.
- Restart applies only to the active tab.
- Existing live tabs keep running while inactive.
- Tab titles may show a stable shell label; do not trust terminal escape sequences to mutate application UI without sanitization.
- Show states: creating, running, restarting, exited, disconnected, failed.
- Distinguish transport disconnection from shell exit.
- On first panel open, create one session only if none exists for that context. Reopening must not duplicate shells.
- Keep terminal visible output when process exits; show exit code/signal where available.
- Use existing theme tokens, readable monospace fonts, keyboard focus and tooltips.
- Fit the active terminal to available area; initialize sizing only when container has nonzero dimensions.
- Switching tabs focuses active terminal. Toolbar navigation must remain keyboard accessible.

Suggested configurable MVP caps: 8 live terminals per project and 16 globally. Exited tabs do not count as live PTYs; bound retained tabs and memory separately. Show a clear limit error, not a silent no-op.

## 5. Shell selection

Use a validated platform-specific executable:
- Unix: available configured user shell, with safe documented fallback.
- Windows: supported PowerShell or configured installed shell, with a documented fallback.

No user-supplied arbitrary launch command string from the browser. Resolve allowlisted shell configuration on trusted host. Do not invoke an extra shell to parse arguments. Follow interactive startup semantics for the chosen shell, not an unconditional login-shell assumption.

Shell startup scripts may produce output such as system info. Do not hardcode ASCII art or run diagnostic commands merely to mimic the screenshot.

## 6. Session model

```ts
type TerminalSession = {
  id: string;
  projectId: string;
  workspaceId: string;
  label: string;
  generation: number;
  status: 'creating' | 'running' | 'restarting' | 'exited' | 'failed';
  cols: number;
  rows: number;
  createdAt: string;
  exitedAt?: string;
  exitCode?: number;
};
```

Connectivity is attachment state, separate from PTY process status. Own sessions by authenticated local user/workspace. PID is internal diagnostics, never sufficient authorization.

## 7. Restart semantics

Restart is not clear screen and not sending Ctrl+C.

1. Capture active session ID and generation.
2. Confirm that current shell/process tree will stop and in-memory jobs/state may be lost. For MVP always show confirmation; reliable foreground-job detection is platform-specific.
3. Disable duplicate restart submissions and acquire per-session lifecycle lock.
4. Detach old input routing.
5. Gracefully terminate the owned shell/process group using supported platform logic.
6. Wait for termination; escalate within a bounded timeout only for the owned process tree.
7. If termination cannot be confirmed, show error and do not create an overlapping replacement shell.
8. Create replacement PTY under the same logical tab ID, increment generation.
9. Start from original configured workspace root, not an unverified inferred cwd.
10. Reset viewport/scrollback after successful replacement and emit a restart notice.

Only the active session restarts. Preserve all other tabs. Working files on disk are not reset or reverted. Shell variables, current directory changes and foreground jobs are not preserved.

Callbacks and packets from old generations must never affect replacement PTY/output.

## 8. Protocol

Control operations (adapt to current HTTP/RPC):
- listSessions(context).
- createSession(context, cols, rows, idempotencyKey).
- restartSession(id, expectedGeneration, approval, idempotencyKey).

WebSocket attachment: authenticated user + authorized session ID + generation.

Client messages:
- input: sessionId, generation, data.
- resize: sessionId, generation, cols, rows.
- ack: sessionId, generation, outputSequence.

Server messages:
- ready/session metadata.
- output: generation, sequence, data.
- exited: generation, exitCode/signal.
- restarted: updated metadata.
- error: safe code/message.
- history_truncated: explicit output gap.

Validate message shapes, byte sizes and dimensions. Rate-limit input/resize. Reject input to exited sessions and stale generations. Use bounded transport queues and backpressure. Do not lose stream ordering or reinterpret terminal bytes as shell commands.

No arbitrary broadcast to all clients. Restrict attachments; simplest MVP is one writable attachment per session, with takeover explicitly confirmed or previous attachment revoked.

## 9. Authentication and web safety

Localhost is not authentication. Bind local daemon to loopback by default, validate allowed origins during WebSocket upgrade, validate credentials/session ownership and reject unauthenticated attachments. CORS settings alone do not secure WebSockets.

Do not put long-lived secrets in URLs. Use existing authenticated session mechanisms or short-lived scoped attachment credentials. Remote deployment requires WSS/TLS and explicit hardening; do not expose this local terminal endpoint publicly by default.

Treat terminal output as untrusted. Feed it to xterm.write, not innerHTML. Disable or gate clipboard-changing escape handling, unsafe link protocols and external window actions. Do not allow output to trigger application commands. Avoid raw keystroke/output telemetry because terminals can contain credentials.

## 10. Resize and lifecycle

Use ResizeObserver + fit addon on active visible container. Send actual cols/rows to PTY with debouncing and bounds. Do not resize hidden tabs to zero. Dispose listeners, sockets and observers on component destruction without killing server shell merely because a view unmounted.

Closing/hiding panel leaves terminals running while daemon remains alive. User is warned before worktree removal or project cleanup if a terminal uses that workspace. Never force-delete an active terminal cwd.

On application shutdown stop owned sessions using bounded cleanup. Do not kill unrelated system processes. Do not promise detached grandchildren will always terminate; document supported platform process-tree behavior and test it.

## 11. Reconnect and buffers

Choose an explicit MVP policy:
- Shells survive UI panel unmount and transient browser disconnection while daemon lives.
- Reattach does not create another shell.
- Shells do not resume automatically across daemon restart.

Use bounded replay with sequence numbers and generations. Retain the existing xterm instance when merely switching tabs.

For browser reload, bounded raw ANSI replay may be incomplete, especially for alternate-screen applications. Either implement a supported headless-terminal serialization strategy or visibly state that screen restoration is partial. Do not call truncated raw output exact terminal state. Avoid replaying partial UTF-8 chunks incorrectly.

On daemon restart report previous sessions as exited/interrupted metadata; create fresh shells only by explicit New tab/Restart. Database session rows cannot restore OS processes by themselves.

## 12. Storage

In-memory TerminalManager owns live PTY handles, per-session locks, generation and bounded buffers.

Persist only preferences and optional session metadata if useful: project/workspace, label, dimensions, timestamps, last status. No raw output, input, command history or environment persistence by default. Shell's own history is managed by the shell, not Loom.

If metadata persistence is added, mark stale sessions interrupted during reconciliation. Never attach to a recycled PID based solely on saved metadata.

## 13. Suggested components/services

Adapt to existing conventions:
- TerminalPanel.svelte.
- TerminalTabs.svelte.
- TerminalViewport.svelte.
- terminal-client.ts transport adapter.
- TerminalManager in trusted backend.
- PTY adapter module to isolate runtime/platform differences.
- Validated protocol types in existing protocol package.

Lazy-load browser-only xterm code to avoid SSR access to window/document. Do not import native PTY bindings into the frontend bundle.

## 14. Tests

Use fake PTY adapters for deterministic unit tests and separate real-PTY platform integration tests.

Required tests:
- New tab creates one independent PTY at intended workspace root.
- Double click/replayed create request does not duplicate shells.
- Multiple tabs preserve independent output/input.
- Switching/hiding/reopening does not restart shells.
- Restart affects only active tab, waits for old writer termination and increments generation.
- Cancel restart confirmation performs no action.
- Failed termination does not launch replacement.
- Late old-generation output/input is ignored.
- Resize sends valid nonzero dimensions only when visible.
- Exited shell rejects input and can be restarted.
- Disconnected transport does not claim PTY exited.
- Reattach does not create another PTY.
- Unauthorized/cross-project sessions and disallowed origins rejected.
- Large frames, invalid dimensions and output floods bounded.
- Terminal bytes never render through innerHTML or trigger application actions.
- App shutdown stops owned sessions without touching agent processes.
- Workspace deletion is blocked while sessions hold its lease.
- Daemon restart does not pretend processes resumed.

Real PTY smoke tests (safe temporary workspace): launch shell, print unique marker, run an interactive read, resize, exit and restart. Verify terminal-size signals where supported. Include Linux/macOS/Windows matrices matching advertised support. Verify Bun/Node packaging compatibility, native binary shipping and cleanup.

No paid AI calls are needed. Do not run tests in user's real workspace or elevated shell.

## 15. Rollout

1. Runtime/native PTY compatibility spike.
2. Authenticated single-terminal flow and size/input/output.
3. Multi-tab manager with limits and idempotency.
4. Restart confirmation and lifecycle locks.
5. Reconnect/backpressure and platform tests.
6. Enable after security and packaging checks pass.

## Acceptance criteria

The panel exposes only New tab and Restart terminal toolbar actions. Each tab is a usable independent interactive shell in the correct workspace. Restart replaces only active shell after confirmation and confirmed shutdown. Tabs survive UI switching, transport is authenticated, resources are bounded, and errors terminate loading. No canvas generation, agent process, file reset or unrelated task is triggered by panel lifecycle.

## Technical references

- https://github.com/xtermjs/xterm.js/
- https://github.com/microsoft/node-pty
- https://xtermjs.org/docs/guides/security/
- https://xtermjs.org/docs/guides/encoding/
