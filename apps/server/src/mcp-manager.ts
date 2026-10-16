import { lstat, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import { Hono } from "hono";

type Project = { id: string; name: string; path: string };
type Options = { projects: { getById(id: string): Promise<Project | undefined> } };
type Dict = Record<string, unknown>;

const configLimit = 1_000_000;
const serversPerSourceLimit = 100;
const serverLimit = 300;

function asDict(value: unknown): Dict | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : undefined;
}

function safePathInside(root: string, candidate: string) {
	const path = relative(root, candidate);
	return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function hostOnly(endpoint: unknown) {
	if (typeof endpoint !== "string") return undefined;
	try {
		const url = new URL(endpoint);
		return url.host;
	} catch {
		return undefined;
	}
}

function commandName(value: unknown) {
	if (typeof value === "string") return basename(value);
	if (Array.isArray(value) && typeof value[0] === "string") return basename(value[0]);
	return undefined;
}

function summarizeServer(runtime: string, scope: string, source: string, name: string, value: unknown) {
	const config = asDict(value);
	if (!config) return undefined;
	const command = config.command;
	const url = config.url;
	const type = typeof config.type === "string" ? config.type.toLowerCase() : "";
	let transport = "Unknown";
	if (["stdio", "local"].includes(type) || command !== undefined) transport = "stdio";
	else if (["http", "streamable-http", "remote"].includes(type)) transport = "Streamable HTTP";
	else if (type === "sse") transport = "Legacy SSE";
	else if (["ws", "websocket"].includes(type)) transport = "WebSocket";
	else if (typeof url === "string") transport = "Invalid or unspecified HTTP transport";
	const args = Array.isArray(config.args) ? config.args : Array.isArray(command) ? command.slice(1) : [];
	const env = asDict(config.env) ?? asDict(config.environment);
	const headers = asDict(config.headers) ?? asDict(config.http_headers);
	const enabled = typeof config.enabled === "boolean"
		? config.enabled
		: typeof config.disabled === "boolean" ? !config.disabled : null;
	return {
		id: `${runtime}:${scope}:${source}:${name}`,
		name: name.slice(0, 160),
		runtime,
		scope,
		source,
		ownership: "native / externally managed",
		transport,
		connectionState: "unknown",
		enabled,
		command: commandName(command),
		argumentCount: args.length,
		endpointHost: hostOnly(url),
		environmentVariableNames: env ? Object.keys(env).slice(0, 80) : Array.isArray(config.env_vars) ? config.env_vars.filter((item): item is string => typeof item === "string").slice(0, 80) : [],
		headerNames: headers ? Object.keys(headers).slice(0, 80) : [],
	};
}

function addDefinitions(
	servers: ReturnType<typeof summarizeServer>[],
	runtime: string,
	scope: string,
	source: string,
	value: unknown,
) {
	const records = asDict(value);
	if (!records) return;
	for (const [name, definition] of Object.entries(records).slice(0, serversPerSourceLimit)) {
		const server = summarizeServer(runtime, scope, source, name, definition);
		if (server) servers.push(server);
	}
}

async function readConfig(path: string, allowedRoot: string) {
	try {
		const info = await lstat(path);
		if (!info.isFile() || info.isSymbolicLink() || info.size > configLimit) return { status: "unavailable", reason: "Config is not a regular file or exceeds the scan limit" } as const;
		const [realRoot, realFile] = await Promise.all([realpath(allowedRoot), realpath(path)]);
		if (!safePathInside(realRoot, realFile)) return { status: "unavailable", reason: "Config resolves outside its expected directory" } as const;
		return { status: "available", text: await readFile(realFile, "utf8") } as const;
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return { status: "not-found" } as const;
		return { status: "unavailable", reason: "Config could not be read" } as const;
	}
}

async function inspectJsonSource(input: {
	path: string;
	allowedRoot: string;
	runtime: string;
	scope: string;
	label: string;
	servers: ReturnType<typeof summarizeServer>[];
	selectServers(parsed: Dict): unknown;
}) {
	const result = await readConfig(input.path, input.allowedRoot);
	if (result.status !== "available") return { id: `${input.runtime}:${input.scope}:${input.label}`, runtime: input.runtime, scope: input.scope, file: input.label, status: result.status, issue: result.reason };
	try {
		const parsed = asDict(JSON.parse(result.text));
		if (!parsed) throw new Error("Expected object");
		addDefinitions(input.servers, input.runtime, input.scope, input.label, input.selectServers(parsed));
		return { id: `${input.runtime}:${input.scope}:${input.label}`, runtime: input.runtime, scope: input.scope, file: input.label, status: "available" };
	} catch {
		return { id: `${input.runtime}:${input.scope}:${input.label}`, runtime: input.runtime, scope: input.scope, file: input.label, status: "invalid", issue: "Config is not valid JSON in the supported schema" };
	}
}

async function inspectTomlSource(path: string, allowedRoot: string, scope: string, label: string, servers: ReturnType<typeof summarizeServer>[]) {
	const result = await readConfig(path, allowedRoot);
	const source = { id: `codex:${scope}:${label}`, runtime: "codex", scope, file: label };
	if (result.status !== "available") return { ...source, status: result.status, issue: result.reason };
	try {
		const parsed = asDict(Bun.TOML.parse(result.text));
		addDefinitions(servers, "codex", scope, label, parsed?.mcp_servers);
		return { ...source, status: "available" };
	} catch {
		return { ...source, status: "invalid", issue: "Config is not valid TOML in the supported schema" };
	}
}

async function discover(project?: Project) {
	const home = homedir();
	const xdgConfig = process.env.XDG_CONFIG_HOME || join(home, ".config");
	const servers: ReturnType<typeof summarizeServer>[] = [];
	const sources: Array<{ id: string; runtime: string; scope: string; file: string; status: string; issue?: string }> = [];
	const globalClaudePath = join(home, ".claude.json");
	sources.push(await inspectJsonSource({
		path: globalClaudePath,
		allowedRoot: home,
		runtime: "claude",
		scope: "global",
		label: "~/.claude.json",
		servers,
		selectServers: (parsed) => parsed.mcpServers,
	}));
	if (project) {
		const globalClaude = await readConfig(globalClaudePath, home);
		if (globalClaude.status === "available") {
			try {
				const parsed = asDict(JSON.parse(globalClaude.text));
				const projectConfigs = asDict(parsed?.projects);
				const matching = asDict(projectConfigs?.[project.path]);
				addDefinitions(servers, "claude", "workspace-local", "~/.claude.json (workspace entry)", matching?.mcpServers);
			} catch {
				// The global source reports the parse failure.
			}
		}
		const projectMcpPath = join(project.path, ".mcp.json");
		sources.push(await inspectJsonSource({
			path: projectMcpPath,
			allowedRoot: project.path,
			runtime: "claude",
			scope: "workspace",
			label: "<workspace>/.mcp.json",
			servers,
			selectServers: (parsed) => parsed.mcpServers,
		}));
	}
	sources.push(await inspectTomlSource(join(home, ".codex", "config.toml"), home, "global", "~/.codex/config.toml", servers));
	if (project) sources.push(await inspectTomlSource(join(project.path, ".codex", "config.toml"), project.path, "workspace", "<workspace>/.codex/config.toml", servers));
	const opencodeGlobalPath = join(xdgConfig, "opencode", "opencode.json");
	sources.push(await inspectJsonSource({
		path: opencodeGlobalPath,
		allowedRoot: join(xdgConfig, "opencode"),
		runtime: "opencode",
		scope: "global",
		label: "OpenCode user config",
		servers,
		selectServers: (parsed) => parsed.mcp,
	}));
	if (project) {
		for (const [path, label] of [
			[join(project.path, "opencode.json"), "<workspace>/opencode.json"],
			[join(project.path, ".opencode", "opencode.json"), "<workspace>/.opencode/opencode.json"],
		] as const) {
			sources.push(await inspectJsonSource({
				path,
				allowedRoot: project.path,
				runtime: "opencode",
				scope: "workspace",
				label,
				servers,
				selectServers: (parsed) => parsed.mcp,
			}));
		}
	}
	const clipped = servers.length > serverLimit;
	return {
		projectId: project?.id ?? null,
		projectName: project?.name ?? null,
		generatedAt: new Date().toISOString(),
		connectionStatus: "not-observed",
		coverage: { maxConfigBytes: configLimit, maxServersPerSource: serversPerSourceLimit, maxServers: serverLimit, truncated: clipped },
		sources,
		servers: servers.slice(0, serverLimit),
	};
}

export function createMcpManagerRoutes(options: Options) {
	const app = new Hono();
	app.get("/inventory", async (c) => {
		const projectId = c.req.query("projectId");
		if (!projectId) return c.json(await discover());
		const project = await options.projects.getById(projectId);
		if (!project) return c.json({ error: { message: "Project not found" } }, 404);
		return c.json(await discover(project));
	});
	return app;
}
