# Loom Context Hub — Full Implementation Specification

Status: proposed implementation, not applied repository changes.
Audience: implementation agents, maintainers and QA.

## 1. Product goal

Provide workspace context that developers can inspect, version and control across Chat, Canvas, Kanban, Review and Walkthrough. Four modules: Knowledge Base, Rules, Skills and Memory. Discover installed native skills across supported coding runtimes, allow manual authoring/import, and deliver relevant context without silently altering user messages or generated output.

This is not a vector-database migration, permission bypass, automatic self-modification system or promise of 70% fewer tokens.

Before implementation inspect current source, schemas, prompts, agents settings, runtime adapters and tests. Extend existing services; do not create duplicate skill/run/usage systems. Earlier repository observations may be stale.

## 2. Terminology

- Knowledge: reference facts/documents about the project.
- Rule: scoped behavioral instruction, not an OS security boundary.
- Skill: reusable procedure packaged as instructions/resources; may have runtime-specific features.
- Memory: sourced durable decision/preference, approved before automatic reuse.
- Runtime provider: coding harness such as Claude Code, Codex or OpenCode, not necessarily upstream model vendor.
- Context plan: resolved set of instructions/references for a run.
- Context snapshot: immutable captured versions and delivery metadata for that run.
- Native delivery: runtime discovers/loads material itself.
- Loom-managed delivery: Loom supplies material through an explicitly supported mechanism.

## 3. Routes and entry points

Suggested project page: /project/[id]/context, adjusted to current routing.
Tabs: Knowledge Base, Rules, Skills, Memory.

Workbench Context panel shows active run context and links to management page. Register with existing Configure panels system; hiding its icon must not disable context or delete data.

User/global skill sources are visible from project Skills view with explicit scope labels. Existing Settings/Agents selects references to the same Skill Library. Do not copy every skill into every agent record.

## 4. UI

Header: Context, project selector where existing, search, Refresh sources, Add.

Knowledge: title, source, scope, tags, version, last checked, stale status.
Rules: name, scope/path match, priority class, enabled, validation/conflict status.
Skills: Workspace and Global groups; name/description, source badges, compatibility, validity, enable status, Details.
Memory: Proposed, Approved, Stale, Archived groups; source and last verification.

Details drawer: complete content, version history, origin path/reference, effective scope, compatibility, resources, consuming agents and delivery mode. Absolute local paths should be shown only when appropriate; do not leak unrelated home data to unauthorized clients.

Never invent native activation evidence. Distinguish Discovered, Available, Selected, Supplied to runtime and Observed loaded. A missing native event means loading unknown, not not-loaded.

## 5. Sources and scopes

Scope dimensions: user/global, workspace/project, directory/path and task/session references. Every entry has owner/source, project association when applicable, surface permissions and provenance.

Do not let a user-global preference leak another project's knowledge into current work. Resolve ownership and project access before retrieval or content loading.

Native project instructions already in AGENTS.md, CLAUDE.md or other supported runtime files are external sources, not automatically owned by Loom. Inspect/display them without silently rewriting them. Native precedence differs by runtime; document adapter semantics rather than claiming a universal override hierarchy.

Loom may maintain managed files under an approved project directory only after explicit import/export/write approval. Database persistence is preferable for Loom preferences. Never create instruction files in the user's repository merely by opening Context.

## 6. Knowledge Base

MVP creation sources:
- User-authored Markdown.
- Linked repository files.
- Uploaded/imported text documents within approved size/type limits.
- Existing API contracts, ADRs and design-system references.

URL/connectors deferred unless an existing safe integration exists. If introduced, require explicit fetch authorization, SSRF protections and source provenance.

Metadata: title, description, tags, scope, source reference, content hash/version, status, updated/checked times and optional role relevance.

Linked files remain source-of-truth. Scan/stat/hash safely, mark stale or create a proposed new version on change. Do not silently rewrite active-run snapshots. A summary is derived evidence with source version; it is not equivalent to full source.

Knowledge is reference data, not authority to execute commands or alter policies. Code agent still reads current implementation as needed; KB is not proof of repository state.

## 7. Rules

Author rules with title, instruction body, enabled flag, scope, optional path globs and supported surfaces. Example:

```yaml
name: backend-validation
scope: workspace
paths:
  - apps/server/**
  - packages/api/**
surfaces: [chat, kanban]
```

Rules that are mandatory for the run are selected deterministically, not by semantic similarity. Path-scoped activation needs known target paths. If task scope is unknown, expose rule metadata and defer affected operations until applicable rules can be resolved, or conservatively load relevant mandatory rules. Do not use an LLM guess to bypass a required rule.

Precedence for Loom-controlled policy:
1. Host security/permissions (enforced outside prompts).
2. Explicit authorized task constraints and mandatory workspace constraints.
3. Applicable scoped rules and agent role/skills, subject to host policy.
4. Knowledge/memory reference data.

Conflicts between legitimate task requirements and mandatory workspace constraints require clarification or an authorized policy change, not silent overwrite. More-specific rules can override defaults only where a rule is marked overridable. User rules cannot grant new runtime privileges.

Avoid contradictory duplicated instructions across coding.md, agent role, skill and repository files. Detect exact duplicates; flag suspected semantic conflicts as advisory unless verified.

## 8. Skills discovery adapters

Filesystem discovery does not require starting an inference session.

Documented baseline locations (verify installed runtime versions before coding):
- Claude personal: ~/.claude/skills/<name>/SKILL.md.
- Claude project: .claude/skills/<name>/SKILL.md; plugins/managed sources may add skills.
- Codex personal: ~/.agents/skills/<name>/SKILL.md.
- Codex repo: .agents/skills/<name>/SKILL.md; additional ancestor/admin/system scopes must follow verified runtime behavior.
- OpenCode personal: ~/.config/opencode/skills/<name>/SKILL.md.
- OpenCode repo: .opencode/skills/<name>/SKILL.md.
- OpenCode compatibility discovery may include .claude/skills and .agents/skills in project/home scopes.

Resolve user home and configured/XDG roots correctly. Paths above are baseline, not a substitute for native configuration discovery. Do not recursively scan unrelated home directories or assume Windows path layouts. Agy/other adapters report unsupported discovery until their real mechanisms are verified; allow manual portable imports meanwhile.

```ts
interface SkillSourceAdapter {
  runtimeId: string;
  discover(input: DiscoveryScope): Promise<DiscoveredSkill[]>;
  validate(skill: DiscoveredSkill): SkillValidation;
  deliveryCapabilities(): SkillDeliveryCapabilities;
  resolveEffectiveSkills(input: RunScope): Promise<EffectiveSkillPlan>;
}
```

Provider discovery failure is isolated. Retain cached entries and mark source unavailable instead of deleting skills. Use bounded scans, file watchers/debounced rescans, no inference. Discovery/import must never execute scripts, dynamic-context commands or plugin hooks.

## 9. Skill format and compatibility

A portable skill directory contains SKILL.md, optionally references/, scripts/ and assets/.

```yaml
---
name: backend-api-review
description: Review API changes for validation, authorization, contracts and tests.
---
```

Separate portable validation from provider-native validation. Fields/constraints and extensions differ; a skill invalid under a portable profile may still be valid for its native runtime. Report profile-specific diagnostics with location and actionable explanation, not one misleading Invalid flag.

Metadata parser must be safe: reject malicious YAML features, bound document size/depth, disallow remote references and unsafe object construction. Rendering Markdown must sanitize HTML/URLs.

Compatibility labels:
- Portable instructions.
- Native runtime feature required.
- Executable scripts present.
- MCP/tool dependency required.
- Untested compatibility.

Do not label Universal solely because directory is .agents/skills. Do not silently translate incompatible invocation control or shell expansion into another harness.

## 10. Identity, duplicates and source conflicts

Canonical filesystem identity detects one physical skill exposed through multiple runtime discovery paths. Content hash detects equal versions; name alone is not identity.

Preserve origins, scope and compatibility. Identical content from different owners may still have distinct trust/provenance; do not silently discard that information.

Same name with different content is a visible variant/conflict. Adapter computes actual native precedence/visibility, which may differ per runtime. UI shows effective native skill and other discovered variants where determinable. Do not assume workspace-wins universally.

Version skill content/resources by deterministic digest. Snapshot resource manifest and relevant resolved content when run uses them. Detect source changes; do not falsely present later file reads as the old immutable version.

## 11. Manual creation/import/export

Actions: Create skill, Link existing directory, Import folder. Optional repository/URL marketplace install is a later approved flow.

Create form: name, description, instructions, user/workspace scope, compatibility profile, activation policy and optional resources.

Validate before save. Link is non-owning/read-only by default; Import copies into a disclosed Loom-owned store with consent. Never overwrite native skill directories automatically. Resolve collisions explicitly.

Imported paths/archive extraction must prevent traversal, symlink escape, zip bombs and oversized resources. Do not install dependencies or run bundled scripts on import. Source content is untrusted. Uninstall removes only owned material after explicit confirmation and never deletes linked native sources by default. Offer Unlink separately.

## 12. Toggle semantics

Store enabled_in_loom separately from native availability/enforcement.

Disable in Loom means Loom does not choose/inject the skill. It does not imply a native CLI cannot independently discover it.

Native disable requires supported adapter enforcement. Codex documents skills.config entries; OpenCode exposes skill permissions. Verify exact syntax/version before mutation. Claude capability must be verified for source/version. If enforcement unavailable, display Not selected by Loom; native runtime may still load.

Never rename/delete source files as a hidden disable implementation. Native configuration writes require approval and preserve unrelated settings. Active snapshots do not change halfway through execution; changes apply to new runs unless an explicit safe transition is implemented.

## 13. Integration with custom agents

Replace duplicated inline copies progressively with skill references and pinned/follow-latest version choice. Preserve existing inline agent skills during migration as distinct authored records; do not discard user edits.

Agent configuration selects role, provider/model, allowed surfaces, skills and additional instructions. A skill can be reused across agents or direct-provider task execution. Skill capabilities are requirements/hints, not new permissions. Effective capabilities are bounded by host/project/surface policy and explicit approvals.

Native delivery and Loom injection are mutually exclusive for each effective skill/run. Record why a skill is native, supplied, excluded or unsupported. Prevent body duplication if native discovery already exposes it. Do not inject all native skill content merely because Loom can read it.

## 14. Memory

Generate proposals only under explicit enabled policy; no automatic promotion to authoritative facts.

Memory example: Invoice amounts use integer minor units; source approved task/review/contract. Candidate completion text or agent self-report is insufficient proof.

Statuses: proposed, approved, stale, archived, rejected. User can edit, approve, reject, supersede and remove under policy. Store evidence links, source version, scope and last_verified_at.

Avoid storing secrets, raw credentials or entire chat histories. Summaries remain derived and may be incomplete. Decisions contradicted by newer source are marked stale and excluded from automatic reuse pending resolution.

Support session-level memory disable. Memory deletion/retention policy must also govern derived indexes and future snapshots; existing immutable run records require an explicit privacy/deletion strategy, not silent universal retention.

## 15. Context Resolver

Resolve with no filesystem/model mutation:
1. Validate user/project/surface access.
2. Load explicit task context and pinned artifacts.
3. Resolve mandatory rules deterministically.
4. Resolve agent references and native/runtime skill visibility.
5. Activate explicit skills; expose metadata for optional discovery.
6. Retrieve approved knowledge/memory under scope policy.
7. Build token/accounting estimates and delivery plan.
8. Detect conflicts/duplication/privacy violations.
9. Persist immutable run context snapshot.
10. Deliver through verified adapter; record observed activation when supported.

Knowledge/memory retrieval and optional skill relevance can start with text search, tags, paths and explicit pins. Do not require Qdrant for MVP. Semantic indexing can be added later without changing authority boundaries. A retrieved knowledge excerpt is not a mandatory rule.

No model-powered classifier is needed when user explicitly selects skill/agent. Deterministic operations such as YAML validation, discovery and hashing do not need LLM calls.

## 16. Lossless mode and progressive mode

Expose an honest policy distinction:

### Strict supplied-context mode
- Preserve user message and requested output format/length.
- Include all user-pinned required documents/skills in full as promised.
- No summarization, pruning, truncation or lossy compression of supplied context.
- If required content exceeds model capacity, block with explanation and options: larger-context model, explicit unpinning, or authorized staged workflow. Do not silently omit material.

### Progressive skills mode
- Preserve user messages and final answers without Loom truncation.
- Make available skill metadata visible first.
- Load complete activated SKILL.md and referenced resources on demand.
- Explain that not all library bodies are present at every step.
- Record deferred/loaded material and reason.

Progressive disclosure is delayed loading, not a claim that every document is always inside the context. Do not advertise it as strict no-filter-all-material mode.

Native CLI compaction/truncation behavior is outside full Loom control. Detect/report where observable, expose configuration where supported, and do not promise lossless native session history if the harness compacts it. Output interrupted by provider token limits must be reported, not labeled complete. Never promise unlimited context/output.

## 17. Cache and efficiency

Goal: reduce unnecessary calls, duplicate injection and repeated input cost without degrading task acceptance.

Caching preserves content but does not free context-window capacity or reduce nominal input token count. Rates, thresholds, retention and support differ by provider/model/platform. API controls cannot be emulated by writing Use cache in a prompt.

For API runtimes use verified provider caching controls. For native CLIs respect their prompt construction and cache behavior; only report observable support.

Stable prefix practice:
- stable system/policy;
- stable scoped rules;
- deterministic skill metadata ordering;
- unchanged pinned references when appropriate;
- append-only conversation where harness supports it;
- dynamic user turn at end.

Keep random IDs/timestamps out of otherwise reusable prefixes unless essential. Do not reorder prefix on every scan. Do not duplicate native and injected instructions. Local parsed-file caches reduce filesystem work, not billable model tokens by themselves.

Continue supported native sessions rather than recreating and re-summarizing every turn. Never reuse session IDs across runtimes. Do not cache model responses as interchangeable coding actions: workspace changes make replay unsafe. Reusing an immutable explanation is different from replaying a side-effecting run.

Caching across provider fallback is not assumed. Validate privacy egress for every destination.

## 18. The 60–70% target

Treat 60–70% as an experimental cost-reduction target on eligible repeated-input workloads, not a guaranteed token-count reduction or subscription-quota saving.

Distinguish:
- total input/output tokens;
- cached input tokens and uncached input;
- actual reported cost vs API-equivalent estimate;
- cache creation cost;
- model/tool/classifier/retry/review overhead;
- cold-start and warm-cache runs;
- task acceptance/test success.

Never reduce answer length or hide required input to make a dashboard target look met. Do not claim savings against an invented baseline. Subscription billing may not reveal an actual per-run charge; unknown cost stays unknown.

Benchmark identical task fixtures, runtime/model versions, permissions and acceptance criteria. Compare baseline (document actual baseline behavior) against dedup/caching and progressive mode separately. Include confidence/variability and task success, not just best-case numbers. If target is not reached, report measured result honestly.

## 19. Context Inspector

For each run show:
- rules and exact versions;
- selected skills, source and delivery mode;
- pinned/retrieved knowledge;
- approved memories;
- deferred/excluded entries and reasons;
- native loading observations vs unknowns;
- estimated context size and observed usage when available;
- stale source warnings and conflicts.

Actions: view source/version, pin for next run, disable for next run, open management page. Do not mutate active run context silently. Inspector never displays secrets or claims exact native token visibility if unsupported.

## 20. Surface-specific restrictions

Chat/Kanban: authorized coding tools and project scope; run snapshot includes task contract.
Canvas: design references/theme/skills only, no project write capability. Coding skills cannot override this.
Review/Walkthrough: read-only evidence and snapshot context; no scripts, shell expansions, commits or file writes.
PM: task planning permissions remain distinct from source-code modification.

Imported script capability or skill instruction cannot grant tools to a restricted surface.

## 21. Parallel worktrees and fallback

Each task run pins its relevant shared contract/rules/skills versions. Frontend and backend can share immutable artifacts without sharing live file state. Materialize needed managed references in a declared run-owned location only under policy; do not commit them accidentally.

If worktree excludes uncommitted native skill files, explain the mismatch or explicitly snapshot approved sources; do not assume all worktrees inherit user working changes.

Native skill reads may occur after source mutation. For reproducibility either supported isolated delivery pins files, or record native live-source limitation and observed hashes. Do not falsely certify immutable skill loading.

Fallback takes the context plan/approved sources and work checkpoint, not another harness's session ID. Recheck compatibility, required rules and allowed external-provider egress. If equivalent policy cannot be delivered, block rather than silently weaken it. Stop previous writer before replacement execution.

## 22. Persistence

Adapt existing schemas/repositories:

context_sources:
- id, owner_id, project_id nullable, source_kind, native_runtime nullable;
- canonical_reference, ownership_mode (linked/managed/imported), trust/status;
- last_scanned_at, error_redacted.

context_entries:
- id, source_id, kind (knowledge/rule/skill/memory), title;
- scope_json, surfaces_json, enabled_in_loom, status, current_version_id;
- created_at, updated_at.

context_versions:
- id, entry_id, content_hash, content/storage_ref, metadata_json;
- resource_manifest_json, validation_profile/results, created_at.

skill_bindings:
- agent_id, entry_id, version_policy (pinned/follow_latest), pinned_version_id;
- enabled, activation_mode; unique agent/entry.

memory_evidence:
- entry_id, source_type, source_id, source_sha/hash, verification_status.

memory_decisions:
- entry/version, proposed_by, decided_by, decision, supersedes_id;
- last_verified_at, timestamps.

run_context_snapshots:
- id, run_id, project_id, surface, resolver_version, policy_mode;
- executor_config_hash, plan_hash, manifest_json, estimate_metadata;
- privacy_policy_version, created_at.

context_activation_events:
- snapshot_id, entry_version_id, runtime_id, event_kind;
- delivery/observed_load/deferred/unsupported, evidence_ref, timestamp.

Native enforcement preferences/config receipts should record verified effect separately from enabled_in_loom. Store safe file reference identities rather than credential-bearing URLs. Index project/kind/status and source/hash as appropriate.

Snapshots/versions contain source material and require access controls, retention limits and deletion policy. Persisted provenance does not authorize cross-project reads. Use transactions for entry/version/binding updates and optimistic revision checks.

## 23. API/service contracts

Use existing Hono/oRPC conventions:
- list/search entries filtered by kind/scope/status.
- create/edit authored entry with expected version.
- link/import approved source.
- refresh/discover sources with bounded job and status.
- get validation and compatibility details.
- toggle Loom selection; separate native disable request.
- agent skill binding management.
- propose/approve/reject/archive memory.
- dry-run resolve context for task/agent/surface.
- inspect run snapshot/activation events.

Server validates owner/project/surface, source paths, required approvals, version conflicts and import bounds. Read endpoints do not install skills or run inference. Generation for memory proposals must be explicitly cost-accounted and opt-in. No arbitrary shell/path endpoint.

Events: context.source_updated, context.entry_versioned, skill.validation_changed, context.conflict_detected, memory.proposed/decided, context.snapshot_created, context.activation_observed. Existing UI event transport should be reused.

## 24. Security

- Restrict scans to configured roots; safely handle symlinks and canonical containment.
- Native source location allowlisting is not permission to modify it.
- Exclude credential material; secret scanning warnings do not guarantee total detection.
- Treat all reference content as untrusted, resist prompt injection, enforce permissions outside prompts.
- Do not run imported scripts or dynamic command substitutions on preview/indexing.
- Approval before native config changes, install/export/remove or external data transmission when policy requires it.
- Imported MCP instructions do not automatically install/connect an MCP server.
- Mark tool dependencies unavailable instead of inventing successful execution.
- Redact logs and errors; do not export full absolute paths/environment casually.

## 25. Testing

Discovery tests with temporary fixture homes/projects:
- Claude/Codex/OpenCode sources, configured roots and platform paths.
- One physical skill discovered by multiple adapters deduplicated without losing origins.
- Same-name/different-content variants preserved.
- Native vs portable validation differences.
- Invalid YAML, malicious resources, symlink traversal and scan limits.
- Source disappearing marks unavailable without destroying cache.
- Discovery executes zero skills/scripts/inference.

Runtime tests:
- native-loaded skills not injected again;
- manual skills delivered through supported mechanism;
- disabled-in-Loom vs native enforcement status distinguished;
- unsupported enforcement cannot claim disabled;
- exact provider/model/alias retained;
- agent references versioned correctly;
- canvas/review cannot gain write/command tools;
- required rule conflict blocks rather than silently chooses;
- fallback checks compatibility and egress.

Resolver/memory tests:
- scope and cross-project isolation;
- mandatory rules not removed by relevance ranking;
- strict pinned input not truncated;
- overflow produces explicit blocked state;
- progressive mode loads complete active bodies on demand;
- proposed/stale memory excluded automatically;
- source changes do not alter captured managed snapshot;
- native live-source limitations recorded;
- migration preserves inline user skills.

Efficiency tests:
- deterministic prefix order/hash;
- no duplicate native injection;
- no model calls for discovery/YAML validation;
- reported cached tokens not double-counted;
- cold/warm/unknown metrics distinct;
- output/user message unchanged by Loom optimizations;
- benchmark quality gates and all overhead included.

UI/E2E:
- import/link/create/validate, disable and inspect;
- invalid skill has actionable issue, not misleading active promise;
- live source refresh and stale warnings;
- memory approval workflow;
- inspector maps exact run context;
- accessible forms, focus and responsive tables;
- failures clear loading and preserve prior valid data.

No default tests against real user home/repo or paid services. Use opt-in native adapter smoke tests in isolated fixture environments.

## 26. Implementation map

Inspect current conventions before choosing paths:
- existing provider adapters: discovery/native delivery capability extensions;
- existing prompt loader: stable shared instructions without duplicated body injection;
- existing agent service/schema: reference bindings, snapshot resolution;
- orchestrator: resolver before run, pinned artifacts and fallback compatibility;
- db/protocol: versioned entries, manifests, validations and events;
- server: authorized CRUD/import/discovery/dry-run APIs;
- web: Context tabs, skill details and run inspector;
- token usage: observable cache/input/output/cost provenance.

Keep source registry, resolver, native enforcement and UI separate. Avoid embedding all policy in one giant prompt or one route handler.

## 27. Rollout

Phase A: read-only native skill discovery, provenance and profile validation.
Phase B: manual authored knowledge/rules/skills with safe import/link.
Phase C: agent bindings, resolver, deduplication and run inspector.
Phase D: approved memory with source/version tracking.
Phase E: cache-aware stable delivery and measured benchmarks.
Phase F: optional semantic retrieval/integrations after measured need.

Feature flags default off for native config mutation, scripts, automatic memory proposals and provider egress expansion. Do not silently enable them during migration.

## 28. Acceptance criteria

Developer sees workspace/global skills from verified native sources and can add manual entries. Provenance, compatibility and validation are accurate. Native discovery cannot execute code. Toggle semantics reflect actual enforcement. Agents share versioned skill references rather than duplicated prompt blobs. Knowledge/rules/memory stay scoped and source-linked. Every managed run has an inspectable context plan. Canvas remains non-writing. Required user/pinned content is not silently truncated. Caching and dedup reduce overhead where supported, with no universal 60–70% claim. Security, adapter, resolver, memory, benchmark and UI tests pass with recorded results.

## Research references

Verify versions and documentation before implementing runtime-specific behavior:
- Claude Code skills: https://code.claude.com/docs/en/skills
- Codex skills: https://learn.chatgpt.com/docs/build-skills
- OpenCode skills: https://opencode.ai/docs/skills/
- Agent Skills specification: https://agentskills.io/specification
- Claude Code caching: https://code.claude.com/docs/en/prompt-caching
- Claude API caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- OpenAI caching: https://developers.openai.com/api/docs/guides/prompt-caching

These references support baseline behavior; they are not proof of installed CLI version capabilities.
