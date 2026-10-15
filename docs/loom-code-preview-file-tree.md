# Loom — Code Preview Panel and File Tree

Status: implementation specification. Inspect current components and backend before editing. This document does not mean changes have been applied.

## 1. Goal and scope

Implement the requested preview panel:
- Syntax-highlighted preview and an explicit edit mode with guarded Save/Discard actions.
- Find and Replace controls with case-sensitive, whole-word, regex, next/previous, replace and replace-all behavior.
- Copy file path and Copy content actions in the code toolbar.
- File-tree toolbar: New file, New folder, Refresh, Collapse all folders.
- Panel controls: Toggle file tree, Expand/restore within application window, Close panel.
- Optional existing search input may remain; no additional editor actions are required.

Reference screenshots define visual intent, not hidden application behavior.

Do not add delete, rename, upload, download, format, terminal or arbitrary command execution to this milestone.

## 2. Panel structure

```text
Panel header
  [file icon] relative/path/file.ext
  [Toggle tree] [Expand / Restore] [Close]

Code preview                         File tree (right)
  [Find/Replace] [Copy] [Edit/Save]      [New file] [New folder] [Refresh] [Collapse all]
  Syntax-highlighted code              Search files (if existing)
  Line numbers                         Hierarchical files and folders
```

Follow existing theme tokens and icons. Provide accessible labels and tooltips for every icon button. Keep the file tree on the right to match the reference.

## 3. Context is mandatory

Every panel instance must know which content it represents:

```ts
type PreviewContext =
  | { kind: 'workspace'; projectId: string; workspaceId: string }
  | { kind: 'snapshot'; projectId: string; snapshotId: string }
  | { kind: 'canvas'; projectId: string; designId: string };
```

Adapt IDs to current architecture. The server resolves the root from trusted records, never a browser-supplied absolute path.

Workspace can target the user project checkout or an owned task worktree. Always show which one is active. Never silently create files in the main project when previewing an agent worktree.

Snapshot and canvas contexts are read-only. Disable New file/New folder with an explanatory tooltip. A walkthrough's captured file content remains immutable even if its live workspace changes.

If no existing workspace ID abstraction exists, add a validated context resolver rather than accepting arbitrary local directory paths.

## 4. Code preview and editing

- Default to read-only display using the existing highlighter where available.
- Edit only the active, complete UTF-8 text file in a bounded textarea editor. Keep the relative path visible.
- Preserve CRLF line endings when saving files that use CRLF.
- Show an unsaved indicator and provide explicit Save and Discard actions.
- Block file switching, refresh, panel close, or navigation that would discard dirty edits unless the user saves or discards first.
- Save with the revision returned by the last read. If the file changed externally, reject the save and ask the user to reload instead of overwriting newer content.
- Keep edits disabled for binary, invalid UTF-8, truncated, oversized, or read-only files.
- Disable mutations while a workspace agent is active. Saving must be authorized and validated by the server.
- Display relative file path, language and line numbers.
- Escape code as text; never render source HTML as application DOM.
- Preserve horizontal scrolling for code. Do not force code reflow as part of this change.
- Binary files show Unsupported binary preview; disable Copy content.
- Empty files show an empty-file state and copy an empty string successfully.
- Apply explicit file-size limits. If truncated, disclose the limit and do not claim Copy content copies the whole file.
- Prefer disabling Copy content for truncated previews until a permitted bounded full-content read succeeds. Never silently copy partial content as a complete file.

### Find and replace

- Provide Find and Replace rows in an editor-style popup, with case-sensitive, whole-word, and regular-expression toggles.
- Support previous/next match, replace current, replace all, and a visible match count.
- Invalid regular expressions show an inline error and do not change file content.
- Find/replace changes only the in-memory draft. Saving still requires the explicit Save action and the current file revision.

### Copy file path

Default: copy project/workspace-relative path exactly as displayed, without Markdown fences or quotes. Example: src/lib/auth.ts.

Snapshot previews copy the captured relative path. Do not expose an absolute local filesystem path as the default.

If absolute-path copy is later requested, add an explicit separate option with privacy considerations; it is out of scope now.

### Copy content

Copy exact displayed complete source content, preserving source line endings where available. Do not include line numbers, syntax highlighting markup, explanatory text or Markdown fences.

On success show a short Copied toast. On clipboard failure show a useful error, not false success. Browser and desktop clipboard access must use the existing platform abstraction and user gesture requirements.

## 5. File tree

- Hierarchical rendering, folders before files, stable sorting.
- Single click on a file opens it in the preview; folder disclosure expands/collapses it.
- Indicate current selected file.
- Track selected folder separately from active file.
- Support lazy loading/virtualization if needed; do not recursively read the whole project without bounds.
- Respect current hidden/ignored-file policy. Do not newly expose .env, private keys or credentials just because a tree exists.
- If Git decorations already exist, preserve their accurate semantics. Otherwise omit colored dots rather than inventing statuses.
- No delete/rename/context menu actions are required.

### Creation target

- A selected folder becomes the parent.
- A selected file uses its parent folder.
- No selection uses workspace root.

Show parent path visibly in creation UI. At root render a clear root label.

### New file

1. Click New file.
2. Show inline input or a compact dialog with parent path.
3. Validate a single entry name.
4. Submit a permission-checked backend action.
5. Create an empty file with exclusive semantics; never overwrite.
6. Refresh only affected directory, expand parent, select and preview the new file.

### New folder

Same pattern, but create exactly one folder and select/expand it. Do not create parent chains implicitly. A parent that disappeared returns a clear error.

### Name validation

- Reject empty/whitespace-only names, dot, dot-dot, NUL and path separators.
- Reject absolute paths and platform-reserved invalid names where applicable.
- Do not automatically append extensions.
- Do not silently trim/rename a legitimate filename after submission. Show validation or normalization before user confirms.
- Detect duplicate file/folder names and return conflict without overwriting.
- Filesystem operations are authoritative for case-insensitive collisions and races.
- Inputs create one entry, not nested paths such as src/a/b.ts. Nested creation may be added separately.

### Refresh

- Revalidate directory listings and active file metadata/content within bounds.
- Preserve expanded folders and selection if still present.
- If active file is deleted, show a missing-file state; do not display old content as current.
- If content changes externally, refresh it and notify without changing context.
- A manual refresh remains available even with a watcher.
- Debounce repeated clicks and ignore obsolete responses from prior context.

### Collapse all folders

- Clear expanded folder IDs for the current tree, retaining visible root entries.
- Do not delete files, clear the active preview or cancel worker runs.
- Preserve active file selection internally even when its parent becomes collapsed.
- Next explicit reveal-selected-file action may expand ancestors; Collapse all must not immediately undo itself through selection effects.

## 6. Panel controls

### Toggle file tree

Hide/show only the right file-tree pane. Code preview fills released space. Preserve search, expansion, selection and tree width when reopening.

Toggle remains available while the tree is hidden. Do not remove the only way to reopen it.

### Expand / restore

Expand the panel to the available application workbench area, not OS/browser fullscreen by default. Preserve previous placement, width and height for restore.

Use an Expand icon in normal mode and Restore icon while expanded. The tree retains its visible/hidden state. Panel expansion must not change workspace or reload provider sessions.

Escape restores expanded mode when no higher-priority dialog/menu consumes Escape. Escape does not close the panel or discard work. Native browser fullscreen is not part of this milestone.

### Close

Close only the preview panel. Do not stop coding agents, remove worktrees, delete files or discard changes. Return focus to the action/file entry that opened it when feasible.

Reopening may restore the prior active file and layout for the same workspace. Validate paths before restoring. Do not reopen stale snapshots as live files.

## 7. State model

```ts
type PreviewPanelState = {
  isOpen: boolean;
  isExpanded: boolean;
  treeVisible: boolean;
  treeWidth: number;
  activeRelativePath: string | null;
  selectedDirectory: string | null;
  expandedDirectoryIds: string[];
  searchQuery: string;
};
```

Persist lightweight preferences by user/project/workspace where appropriate, not file contents, credentials or full absolute paths in localStorage. Reset transient expanded layout on invalid restoration. Distinguish loading states for list, file content, create and clipboard actions.

Cancellation/request sequence guards must prevent a slow response from workspace A replacing content after user selects workspace B.

## 8. API/service design

Use current API conventions rather than forcing specific HTTP routes.

Required operations:
- listDirectory(context, relativeDirectory, cursor?).
- readFile(context, relativePath, expectedRevision?).
- writeFile(context, relativePath, content, expectedRevision, requestId), with bounded UTF-8 content and stale-revision rejection.
- createFile(workspaceContext, parentRelativePath, name, requestId).
- createDirectory(workspaceContext, parentRelativePath, name, requestId).

Return sanitized errors: NOT_FOUND, ALREADY_EXISTS, INVALID_NAME, FORBIDDEN, OUTSIDE_WORKSPACE, READ_ONLY_CONTEXT, FILE_TOO_LARGE, UNSUPPORTED_BINARY, STALE_CONTEXT.

Read response should include content, encoding, revision/hash, byte size and complete/truncated status. Define supported decoding (UTF-8 for MVP) and report unsupported encoding instead of corrupting source silently.

Creation returns canonical relative path and updated metadata. Use stable request IDs and operation receipts so retries do not create duplicates or misreport another user's existing file as a successful replay.

## 9. Filesystem and permission enforcement

- Authenticate/authorize project and workspace access server-side using current Loom policy.
- Enforce root containment using canonical paths and platform-aware comparisons, not string-prefix checks alone.
- Validate parent ownership and symlink behavior. Do not follow symlink parents outside the authorized root.
- For MVP disallow creating through symlink directory components unless race-resistant containment is implemented.
- Use exclusive file creation and non-recursive directory creation; never overwrite.
- Save existing files with revision checks and same-directory atomic replacement where supported; do not follow symbolic links.
- Do not invoke a shell for mkdir/touch/file reading.
- Enforce read-only snapshot/canvas restrictions on the server, not just disabled buttons.
- Follow host approval policy for creation; UI user gesture does not bypass a required approval gate.
- Record project/workspace, relative path, action, user and time; do not log file contents or secrets.

Worktree paths are not a security sandbox. Use available capability controls and disclose their limits.

## 10. Concurrency with agents

User creation while an agent writes may produce races even in one workspace.

Use the existing workspace mutation coordinator if present. Otherwise add a narrow claim/lock around create operations. If the workspace has an active exclusive agent writer, either reject with Workspace busy or require a safe pause according to task policy. Do not silently interrupt the agent.

Read-only preview and copy can remain available while a worker runs, with a notice that content is live. Snapshot previews remain stable.

## 11. Suggested component structure

Adapt to current Svelte layout:

```text
CodePreviewPanel.svelte
PreviewPanelHeader.svelte
CodePreviewToolbar.svelte
ReadOnlyCodeViewer.svelte
WorkspaceFileTree.svelte
FileTreeToolbar.svelte
CreateWorkspaceEntryDialog.svelte
```

Use existing component primitives and clipboard/IPC abstractions. Do not introduce a new framework. Keep filesystem access out of renderer components.

## 12. Accessibility and responsive behavior

- Labeled icon controls with keyboard access and visible focus.
- Proper tree semantics; Arrow keys expand/collapse/navigate when a real tree interaction model is implemented, Enter opens a file.
- Creation input supports Enter submit and Escape cancel, preserving focus.
- Toolbar buttons remain reachable at narrow widths.
- On narrow screens show the tree as a drawer or switched pane instead of compressing code to unusable width.
- Live-region feedback for creation/copy errors and successes without reading file contents aloud.

## 13. Tests

### Unit/component
- Exactly two code actions: Copy path and Copy content.
- Relative path copied correctly.
- Exact text copied without line numbers/markup.
- Clipboard failure and empty-file content handled.
- Binary/truncated previews disable misleading content copy.
- Edit/save preserves line endings, rejects stale revisions, and leaves unsaved drafts intact on save failure.
- Find/replace handles case, whole-word and regex options, navigation, replace-current and replace-all.
- Dirty edits block panel/file/session changes until saved or discarded.
- Tree toggle preserves selection/expansion and can always reopen.
- Expand fills workbench and Restore returns prior layout.
- Close does not call worker abort or filesystem removal.
- Collapse all does not clear active preview or immediately re-expand.
- Refresh preserves surviving state and handles deleted files.
- Obsolete async responses cannot replace another context.

### API/filesystem — temporary directories only
- File/folder creation succeeds under correct parent.
- Existing entries never overwritten.
- Root, selected-folder and selected-file parent rules match UI.
- Invalid/reserved names and traversal rejected.
- Symlink escape and cross-project access rejected.
- Snapshot/canvas creation rejected even via direct API.
- Same request replay handled correctly.
- Concurrent creation race returns one success and a safe conflict.
- Active-writer policy enforced.
- No mutation outside authorized workspace.

### E2E

1. Open a fixture workspace preview.
2. Select auth.css, edit it, and verify Save updates the file without changing line endings.
3. Change the file externally and confirm stale-revision Save is rejected without overwriting it.
4. Verify Find/Replace options, previous/next, replace-current and replace-all.
5. Copy path/content using a test clipboard stub.
6. Create a folder, then a file inside it.
7. Verify selection, preview and filesystem result.
8. Collapse folders; current preview remains.
9. Toggle tree, expand panel, restore and close.
10. Confirm no agent cancellation or unrelated file edits.
11. Open a snapshot and verify mutation controls and APIs are read-only.

No tests against the user's real project directories. Do not call paid providers; this feature does not require AI generation.

## 14. Rollout

1. Add safe directory listing, read-only preview and copy actions.
2. Add panel toggle/expand/close state and file-tree controls.
3. Add permission-checked create and guarded save operations.
4. Add editor-mode find/replace and stale-revision handling.
5. Complete filesystem and E2E tests before enabling mutations by default.

## 15. Acceptance criteria

- Preview toolbar provides Find/Replace, Copy path/content, Edit, Save and Discard.
- Tree toolbar has New file, New folder, Refresh and Collapse all.
- Panel supports workbench expansion/restore, close and tree toggle.
- User knows whether the target is main project, task worktree or immutable snapshot.
- New entries never overwrite files or escape root.
- Snapshot/canvas previews cannot modify project files.
- Copy and render preserve source integrity; guarded saves preserve newer external content.
- Closing preview does not terminate tasks or discard output.
- UI errors clear loading, preserve context and provide actionable feedback.
- All required component, filesystem and E2E tests pass with recorded results.
