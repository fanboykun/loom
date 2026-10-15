# Loom — Configure Rail Panels

Status: implementation specification. Inspect existing panel/layout components and preference storage before editing.

## Objective

Add a Configure panels action to the workbench side rail. Open a normal settings dialog containing labeled checkboxes. Checked panels have visible rail icons; unchecked panels have hidden icons. Hiding an icon does not delete data, disable functionality or terminate background work.

Use the supplied screenshot as visual guidance, reusing existing theme tokens and dialog primitives. This is a normal dialog, not a destructive alert dialog.

## Entry point and UI

Add an always-visible Configure panels icon/button at the bottom of the rail with tooltip and accessible label. Never include this control among hideable panels.

Dialog:
- Title: Configure panels.
- Description: Choose which panels appear in the sidebar. Hidden panels keep their data.
- One checkbox per registered, available panel, with user-facing label and optional icon.
- Close button.
- Reset to defaults action.

Changes apply immediately. Close, outside click and Escape dismiss the dialog without rolling back changes. Do not show Save/Cancel controls when auto-saving. If persistence fails, show a retryable message and preserve the current-session choice.

Do not blindly copy every panel from the screenshot. Only list features actually registered in Loom. An unfinished Git/PR/integration feature must not appear as a working panel.

## Single panel registry

Use existing registry if present. Otherwise introduce a typed shared frontend registry:

```ts
type PanelDefinition = {
  id: string;
  label: string;
  icon: unknown; // replace with the project's icon component type
  defaultVisible: boolean;
  configurable: boolean;
  isAvailable: (context: PanelContext) => boolean;
  open: (context: PanelContext) => void;
};
```

Stable IDs, not translated labels or array indexes, identify preferences. Registry is authoritative for icons, dialog entries and panel opening. Do not maintain three inconsistent hardcoded lists.

Panel open handlers must reuse existing behavior. Configuring visibility must not start terminal sessions, regenerate walkthroughs or invoke providers.

## Visibility semantics

Separate:
- Availability: feature exists and can be used under current context/permissions.
- Rail visibility: user's icon preference.
- Open/active state: whether the panel is currently displayed.
- Lifecycle: background work and underlying data.

A hidden icon does not imply unavailable or unauthorized. A visible preference does not bypass permissions.

When hiding the currently open panel, leave its content open and focused. Only remove its icon. The existing panel Close action remains available. This avoids losing active work. Document and test this behavior.

Allow all configurable icons to be hidden. Configure panels remains visible so recovery is always possible. Reset restores registry defaults, not all checkboxes to true.

Unavailable contextual panels should not appear as enabled working options. For MVP omit them from the dialog while preserving saved preferences. When they become available again, restore the user's visibility choice.

## Hidden panel access

If command palette already exists, keep Open <panel> commands available for authorized hidden panels. Opening one does not automatically pin its icon again.

Do not build a command palette solely for this feature or claim access through one if absent. Minimum recovery path is Configure panels, which can re-enable the icon. Dialog description should mention command palette only if implemented.

## Preferences

Recommended MVP scope: per local user/workbench, consistent across projects on the same device. Use existing preference service; do not invent user identity infrastructure. Cross-device sync and project overrides are out of scope unless already supported.

```ts
type RailPanelPreferences = {
  version: 1;
  visibilityOverrides: Record<string, boolean>;
};
```

Effective visibility:
1. Panel must be available under current permissions/context.
2. Non-configurable entries follow registry behavior.
3. Use saved boolean override if present.
4. Otherwise use defaultVisible.

Persist only boolean overrides and schema version, not panel content, credentials or workspaces. An empty override map means default configuration.

Load preferences before first rail render where practical; use safe defaults if storage is inaccessible, malformed or incompatible. Access browser storage only on client, not during SSR. Ignore unknown IDs safely and preserve valid preferences according to migration policy.

Newly introduced panels use their own defaultVisible value. Removed panels cannot produce ghost icons. Labels may change without resetting IDs.

Use the project's existing persistence mechanism. Browser-local storage is sufficient for MVP if no preference service exists; database tables are not required. If backend sync already exists, validate keys/boolean values and user ownership.

## Accessibility

- Use dialog semantics with accessible title/description, not alertdialog.
- Trap focus while open and restore focus to Configure panels on close.
- Escape dismisses; checkbox labels are clickable.
- Keyboard Space toggles checkbox; visible focus required.
- Icon tooltips do not replace accessible labels.
- Respect reduced-motion preferences and supported narrow viewports.
- Dialog body scrolls when panel list exceeds viewport height.
- Do not repeatedly move focus when the rail rerenders.

## Components and implementation

Adapt names to existing structure:
- panel-registry.ts.
- rail-panel-preferences.ts.
- ConfigurePanelsDialog.svelte.
- existing WorkbenchRail component: filter by effective visibility and retain configure entry.

Keep stores/subscriptions lifecycle-safe. Rendering icon preferences must not remount/recreate terminal or agent runtimes. Avoid rewriting existing panel shell or adding a new UI library.

## Failure cases

- Invalid stored JSON: use defaults without crashing.
- Storage quota/denial: keep session state and show nonblocking retry guidance.
- Panel becomes unavailable: hide inaccessible action while retaining preference.
- All icons hidden: Configure panels remains accessible.
- Dialog reopening: checkbox state matches current preferences.
- Multiwindow updates, if existing architecture supports them: reconcile using its preference events; do not overwrite newer state with stale component snapshots.

## Tests

Unit/store:
- defaults apply when no overrides;
- false overrides remain false;
- unavailable panel is never exposed by saved visibility;
- new registry panels inherit defaults;
- reset clears overrides;
- malformed/unknown-version storage is safe;
- persistence failures do not crash workbench.

Component:
- Configure panels always present;
- dialog entries match available configurable registry panels;
- checkbox toggles corresponding icon immediately;
- active content remains open when icon hidden;
- hiding terminal does not call kill/abort or discard tabs;
- hiding walkthrough does not delete/recreate generation;
- hidden panel opening via existing palette does not re-pin;
- close/Escape preserves auto-saved changes;
- focus trap and restoration work;
- unavailable panels cannot be opened through hidden-state bypass.

E2E:
1. Open dialog and hide Files and Terminal.
2. Verify only corresponding icons disappear.
3. Reload and verify preferences persist.
4. Reopen dialog and show them again.
5. Hide every configurable icon and verify configure control remains.
6. Reset and verify default set restored.
7. Verify active terminal remains the same session throughout hiding/showing.

Use fake panel handlers; this feature needs no paid provider calls or filesystem writes.

## Acceptance criteria

User can show/hide existing rail icons from an accessible dialog. Visibility persists using current preference infrastructure. Panel content and running work are unaffected. Configure panels cannot hide itself. Unavailable features and permissions are respected. Reset and storage-failure paths work, and automated tests verify state/lifecycle separation.
