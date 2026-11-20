import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BackendConfig } from "./backend.ts";

function isExecutable(path: string) {
	try {
		if (!statSync(path).isFile()) return false;
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

export function commandPath(
	command: string,
	cwd: string,
	pathVar: string | undefined,
) {
	const candidates = command.includes("/")
		? [resolve(cwd, command)]
		: (pathVar ?? "")
				.split(delimiter)
				.filter(Boolean)
				.map((dir) => resolve(cwd, dir, command));
	return candidates.find(isExecutable);
}

export function resolveCommand(
	command: string,
	cwd: string,
	pathVar: string | undefined,
) {
	const file = commandPath(command, cwd, pathVar);
	return file && realpathSync(file);
}

// why: a Backend whose command line starts with `NAME=value` assignments (an `env` wrapper or a launcher) reads settings from a different environment than piu.
export function backendEnvironment(
	config: BackendConfig,
	env: NodeJS.ProcessEnv,
) {
	const merged = { ...env };
	for (const arg of config.args) {
		const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(arg);
		if (!match?.[1]) break;
		merged[match[1]] = match[2] ?? "";
	}
	return merged;
}

// why: Pi resolves a leading `~` and a `file:` URL in a resource path against the home of the process that reads it, which for the Backend is the one its command line sets.
export function expandPath(value: string, home: string) {
	const trimmed = value.trim();
	if (trimmed.startsWith("file://")) return fileURLToPath(trimmed);
	if (trimmed === "~") return home;
	if (trimmed.startsWith("~/")) return join(home, trimmed.slice(2));
	return trimmed;
}

// why: the agent dir Pi reads its settings from follows the Backend's own environment, so `PI_CODING_AGENT_DIR` and `HOME` come from its command line rather than from piu's.
export function backendAgentDir(cwd: string, env: NodeJS.ProcessEnv) {
	const home = env.HOME ?? homedir();
	return resolve(
		cwd,
		expandPath(env.PI_CODING_AGENT_DIR || join(home, ".pi/agent"), home),
	);
}
