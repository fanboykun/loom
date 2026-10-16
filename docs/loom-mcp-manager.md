# Loom — MCP Manager Implementation Specification

Route: /settings/mcp (adapt to existing settings convention).
Status: proposed implementation. Inspect current services, native CLI MCP support and protocol SDK compatibility before changing code.

## 1. Goal

Show configured MCP servers and actual connection status, let users add local or remote servers, inspect available tools and configure which agents/runs may use them. Optionally expose a separate built-in Loom MCP server for IDE resources.

The screenshot's built-in server status is inspiration only. Do not claim its displayed CLI list/tool count is supported in Loom.

MCP server configuration is not proof a server is running, connected, authorized or attached to an agent.

## 2. Distinct concepts

- External MCP server: Loom or a native CLI is its client.
- Built-in Loom MCP server: exposes selected IDE capabilities to clients.
- Managed server: Loom owns local process lifecycle or its remote connection.
- Discovered native configuration: read from a coding runtime; ownership is external unless explicitly imported.
- Runtime attachment: particular agent run has an effective, authorized connection.

An HTTP MCP server can be connected without a local PID. A stdio server discovered in another app's configuration cannot safely be treated as a reusable running process.

## 3. Page UX

Header: MCP, explanatory subtitle, Refresh, Add MCP server.
Tabs: Servers and optional Built-in Loom Server.

Summary: Connected connections, Configured servers, Needs authentication, Errors.

Server list:
- name, scope, transport, ownership/source;
- status and effective enabled setting;
- tools/resources/prompts count where negotiated;
- attached runs/clients count when observable;
- last successful handshake and safe error;
- actions Details, Test connection, Connect/Start, Disconnect/Stop, Edit, Remove.

Only show Stop for a Loom-owned process. Remote action is Disconnect, not kill remote server. Show per-instance connections when project/run isolation produces multiple sessions from one definition; do not conflate definition and process count.

No fake Ready from configuration presence. Failed refresh retains previous information labeled stale.

## 4. Add form

Fields:
- name, scope (user/global or workspace), project if workspace;
- transport: stdio or Streamable HTTP;
- enabled for Loom;
- activation: on demand (default) or approved autoconnect;
- attachment policy: selected agents/surfaces;
- timeout and safe restart policy.

stdio fields: executable, argument array, optional approved cwd/context, secret-backed environment references and nonsecret overrides.

HTTP fields: endpoint, authentication method, secret-backed headers when supported and approved by host policy.

Use structured inputs, not a pasted arbitrary shell string. Optional JSON import accepts only documented schema with a preview. Import is inert until explicit start/connect approval; unknown fields are flagged. Never run package managers just to validate JSON.

Default endpoint security: HTTPS for remote hosts; HTTP loopback only by explicit local policy. Validate redirects and egress policy to prevent SSRF. Private network endpoints may be legitimate developer services but require deliberate allowed scope; do not permit arbitrary metadata-service access.

## 5. Transports and SDK

Use a maintained MCP SDK with negotiated protocol support. Verify actual SDK version and CLI compatibility; do not hand-roll JSON-RPC framing or assume one protocol version works everywhere.

- stdio: client launches subprocess, protocol over stdin/stdout; diagnostics go to stderr.
- Streamable HTTP: connect to independent server endpoint.
- Legacy SSE only as an explicitly supported compatibility path after verification, never silently reinterpret an endpoint.

Connection lifecycle follows negotiated initialization and capability exchange before listing supported tools/resources/prompts. Counts are observed results, not constants. Handle pagination and capability absence. Do not make optional capabilities mandatory.

Connection Test executes/contacts third-party code/services and therefore requires the applicable approval. It must not call business tools or mutate application data intentionally, but server startup itself may have side effects: disclose this limitation.

## 6. Architecture

McpRegistry stores definitions and provenance.
McpConnectionManager owns lifecycle, per-run/client contexts and negotiated capabilities.
McpPolicyService enforces attachments and tool permissions.
McpCredentialStore resolves secrets.
McpRuntimeBridge integrates supported coding harnesses.
Optional LoomMcpServer exposes limited built-in IDE tools.

Frontend communicates only with authenticated Loom APIs; it does not launch processes or receive credential values. Separate administrative UI routes from MCP protocol endpoints.

## 7. Native CLI discovery and delivery

Create capability adapters for Claude Code, Codex, OpenCode, Agy and future runtimes. Verify installed help/config schemas and supported transports/auth before enabling each feature.

Adapter capabilities: discover configs, temporary/run-scoped config, lifecycle visibility, native permissions, tool visibility control, OAuth ownership and hot reload.

Do not assume common mcp.json paths/flags. Imported config shows source runtime and whether effective changes are enforced. Never rewrite global native config without approval or overwrite unrelated entries. Prefer run-scoped supported configuration.

A single definition may be connected by Loom for inspection and separately by a native runtime for execution. Display both as distinct instances. Do not claim Loom can observe/control all native tool calls if it cannot.

MVP may support managed inspection first with clear Not attached to this runtime status. A tool list on Settings must not imply agent access.

## 8. Attachment policy

Explicit allowed surfaces: chat, kanban, canvas, review, walkthrough. Defaults: deny until chosen; no implicit attach-everywhere.

At run creation, snapshot server definition version, tool policy and permitted runtime. Validate project/agent eligibility and credentials. If provider fallback happens, revalidate support, auth and data egress; never silently weaken permissions.

Canvas/Review/Walkthrough require enforced read-only tools or no MCP tools. Tool annotations such as readOnlyHint are untrusted hints, not proof or authorization. For external unknown tools, require explicit classification/approval and deny in read-only surfaces by default.

Policy enforcement has to intercept real tool execution or use a verified native restriction mechanism. If unavailable, refuse strict-policy attachment rather than relying on prompt instructions. MCP transport alone does not guarantee sandboxing or read-only behavior.

Skills with MCP dependencies reference a server/tool requirement. Installing a skill does not install/connect/authorize its MCP server automatically.

## 9. Tool details and consent

Details show exact tool name, namespaced server identity, description, validated input schema, annotations marked advisory, allowed surfaces and policy.

Separate permissions for reading data, mutations, destructive operations and external egress according to Loom policy. Confirmation uses resolved target and complete intended operation before side effects. Approval for starting a server is not blanket approval for all tools.

Treat tool descriptions/results as untrusted content. Never execute embedded instructions or HTML. Bound output and disclose limitations without claiming truncated data was complete. Preserve structured error semantics and sanitized diagnostics.

Schema/catalog changes invalidate relevant approvals or trigger revalidation. Do not silently trust a newly added tool just because server name is unchanged.

## 10. Lifecycle

Definition enabled/disabled is separate from connection state:
- stopped/disconnected;
- starting/connecting;
- initializing;
- connected;
- needs_auth;
- degraded;
- failed;
- stopping/disconnecting.

On demand: initialize only when explicitly used, not every page load. Autoconnect is opt-in and only after initial trust/approval. Start/connect is idempotent per intended instance. Use locks and stable request IDs to prevent duplicate process launches.

Restart owned stdio processes with bounded graceful shutdown and termination confirmation. Do not launch a replacement while old process ownership/termination is uncertain. Stop affects only managed instance, not provider CLI or unrelated processes.

Disabling prevents new attachments; offer a separate explicit disconnect-active action. Warn if runs depend on a server. Do not delete credentials/config/workspace data as a hidden consequence.

Remote reconnects/backoff bounded; do not blindly retry side-effecting tool calls after ambiguous failure. Cancellation is best-effort and must not claim rollback. On daemon restart reconcile state; remote sessions may need reinitialization. Saved PIDs are not safe proof of ownership.

## 11. Credentials and HTTP authorization

Use OS credential storage when available or existing protected backend secret storage with explicit limits. Database stores secret references, not plaintext tokens. Values are write-only/redacted to UI; editing config need not reveal old values.

Use supported MCP HTTP authorization flows when required by server, using SDK capabilities and correct audience/scope handling. Do not invent login endpoints or forward another provider's token. stdio credentials are explicitly passed through minimal approved environment, not HTTP OAuth assumptions.

OAuth redirects/issuer/audience validation and token refresh must follow negotiated SDK/protocol support. If remote service requires unsupported auth, show unsupported rather than Connected.

## 12. Built-in Loom MCP server (optional separate phase)

Expose a small verified read-only tool set first:
- workspace metadata;
- task/run state;
- authorized bounded Git status/diff;
- approved context references;
- existing check results.

No generic shell, arbitrary filesystem reader, database executor or Docker socket passthrough. Docker writes, merge and file mutations are out of scope initially.

Run on loopback by default. Validate Host/Origin appropriately, authenticate clients and use short-lived scoped run credentials. Loopback is not authentication. Per-request project/workspace authorization is mandatory; client-supplied project IDs are not authority.

Display bind endpoint only while actually available. Never hardcode number of registered tools or list a CLI as supported before testing its bridge. Do not expose credentials in generated runtime config/logs. Keep tokens out of URL query strings.

Tool scopes derive from run/workspace capability, not global current-project UI state, so parallel agents cannot cross-read another task accidentally.

## 13. Token efficiency

MCP tool schemas/descriptions can consume model context. Do not attach every server/tool to every run. Use explicit server selection and capability-constrained relevant tools. This selection must not override user-pinned required tools.

If a runtime supports verified deferred discovery, use it; otherwise show its actual limitations. Local caching of schemas reduces discovery network work but is not automatically token savings. Stabilize unchanged tool ordering and cache-compatible inputs where supported.

Record visible tool/schema overhead estimates separately from observed provider usage. Never claim a fixed savings percentage. Discovery/health checks do not require paid LLM calls.

## 14. Data model

Reuse existing config/run/event infrastructure. Suggested concepts:

mcp_server_definitions:
- id, owner_id, project_id nullable, name, transport;
- source_runtime, source_ref, ownership (managed/linked/native);
- nonsecret_config_json, credential_refs, version_hash;
- enabled_in_loom, activation_policy, timestamps.

mcp_connections:
- id, definition_id, project_id, run_id nullable, runtime_id;
- owner_process_marker nullable, negotiated_protocol, capabilities_json;
- state, last_handshake_at, last_error_redacted, started/ended_at.

mcp_catalog_entries:
- definition/connection, kind (tool/resource/prompt), name;
- schema/metadata_json, catalog_hash, observed_at.

mcp_bindings:
- agent/project/run selector, definition_id, tool_policy_ref, surface, enabled.

mcp_call_audit:
- run/connection/tool, decision, approval_ref, latency, status, safe error;
- arguments/results content not logged by default, secret redaction mandatory.

Credentials live outside ordinary config rows. Bound catalog/log retention. Historical deleted-server references should remain understandable without retaining secrets.

## 15. APIs

Adapt current Hono/oRPC style:
- list/detail definitions and current instances;
- create/update/import with version checks;
- test/start/connect/stop/disconnect;
- authentication begin/status/revoke where supported;
- tools/resources/prompts list with pagination;
- agent/run bindings and policies;
- sanitized events/logs;
- remove/unlink with ownership-aware confirmation.

All mutations require authorization and relevant approval. Remove is not the same as stop, uninstall or remote deletion. Read endpoints do not start arbitrary code. Avoid APIs that accept untrusted shell strings or arbitrary config file destinations.

## 16. Tests

Use fake MCP server fixtures, temporary workspaces and isolated credentials. No real paid tools or production services by default.

Required cases:
- stdio handshake, valid protocol output and stderr separation;
- HTTP connection/capability negotiation;
- unsupported version/auth/transport displayed accurately;
- tool count from negotiated paginated catalog;
- configured vs connected vs attached states distinct;
- double-start and restart races prevented;
- remote Disconnect never attempts process kill;
- wrong Origin/session/project and unauthorized clients denied;
- secrets absent from responses/logs/generated public config;
- import does not execute code; malformed/traversal configs rejected;
- read-only annotation cannot bypass enforcement;
- Canvas cannot invoke mutation tools;
- native bridge unsupported capability cannot claim enforcement;
- fallback rechecks policy and compatibility;
- side-effecting call not retried after ambiguous failure;
- disable/stop/remove have separate safe semantics;
- existing Skills dependency produces actionable missing-server notice;
- no automatic install from skill description;
- runtime config writes preserve unrelated fields and require approval;
- UI failure/cancel/reconnect states never load forever.

Optional real CLI matrix verifies installed versions and run-scoped attachment with a harmless fixture MCP tool. Record supported versions instead of assuming universal compatibility.

## 17. Rollout

1. Read-only native-config inventory and accurate UI states.
2. Managed stdio/HTTP add/connect/test with credential safety.
3. Catalog/details and explicit attachment to one verified runtime.
4. Permission enforcement and remaining verified runtime bridges.
5. Skills dependencies and Context Inspector integration.
6. Optional built-in Loom MCP read-only server.

No implementation claims about tool counts/CLI support before tests pass.

## Acceptance criteria

User sees configured MCP definitions and actual live connection instances, adds approved local/remote MCPs, inspects real negotiated tools and assigns access explicitly. Start/connect and remove are permission-controlled. Secret and project boundaries hold. Agent attachment is verified per runtime; unsupported enforcement is visible and not faked. Internal Loom server is clearly separate. No hidden process execution on opening Settings, no automatic skill-triggered installs, and lifecycle/security tests pass.

## References

- https://modelcontextprotocol.io/specification/2026-07-28/basic/transports
- https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization

Use protocol versions supported by actual SDKs/clients; verify release documentation before implementing version-sensitive details.
