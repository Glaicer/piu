import { execFile } from "node:child_process";
import { readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import type { BackendConfig } from "./backend.ts";
import { resolveCommand } from "./backend-command.ts";
import type { BackendInstall } from "./backend-install.ts";
import {
	type InstallOrigin,
	installOrigin,
	readObject,
	sameFile,
} from "./install-origin.ts";

// why: a Backend whose command line starts with `NAME=value` assignments (an `env` wrapper or a launcher) reads settings from a different environment than piu.
function backendEnvironment(config: BackendConfig, env: NodeJS.ProcessEnv) {
	const merged = { ...env };
	for (const arg of config.args) {
		const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(arg);
		if (!match?.[1]) break;
		merged[match[1]] = match[2] ?? "";
	}
	return merged;
}

function probe(
	command: string,
	args: string[],
	env: NodeJS.ProcessEnv,
	cwd: string,
) {
	return new Promise<string>((done, reject) => {
		execFile(
			command,
			args,
			{ env, cwd, timeout: 10000, maxBuffer: 65536, encoding: "utf8" },
			(error, stdout) => (error ? reject(error) : done(stdout.trim())),
		);
	});
}

export function pnpmGroups(
	origin: Extract<InstallOrigin, { manager: "pnpm" }>,
) {
	if (origin.layout === "5") return [origin.project];
	const groups = new Set<string>();
	const entries = (() => {
		try {
			return readdirSync(join(origin.root, origin.layout), {
				withFileTypes: true,
			});
		} catch {
			return [];
		}
	})();
	for (const entry of entries) {
		let project: string;
		try {
			project = realpathSync(join(origin.root, origin.layout, entry.name));
		} catch {
			continue;
		}
		if (groups.has(project)) continue;
		const dependencies = readObject(
			join(project, "package.json"),
		)?.dependencies;
		if (
			typeof dependencies === "object" &&
			dependencies !== null &&
			origin.packageName in dependencies
		)
			groups.add(project);
	}
	return [...groups];
}

export async function planBackendUpdate(
	config: BackendConfig,
	install: BackendInstall,
	version: string,
	options: { cwd: string; env: NodeJS.ProcessEnv },
) {
	const env = backendEnvironment(config, options.env);
	const origin = installOrigin(config, { ...options, env });
	if (!origin)
		throw new Error("Cannot determine how to update this installation");
	if (
		origin.family !== install.family ||
		install.id !== `${install.family}:${origin.file}`
	)
		throw new Error(
			"The configured Backend installation changed; retry /update",
		);
	delete env.PIBOLT_UNVERIFIED;
	delete env.PIBOLT_ALLOW_UNSIGNED;
	const make = (command: string, args: string[]) => ({
		...origin,
		command,
		args,
		env,
	});
	if (origin.manager === "curl") {
		const home = env.HOME ?? homedir();
		const rawDir = env.PI_CODING_AGENT_DIR || join(home, ".pi/agent");
		const expanded =
			rawDir === "~"
				? home
				: rawDir.startsWith("~/")
					? join(home, rawDir.slice(2))
					: rawDir.startsWith("file://")
						? fileURLToPath(rawDir)
						: rawDir;
		const agentDir = resolve(options.cwd, expanded);
		env.PI_CODING_AGENT_DIR = agentDir;
		if (
			env.PI_SELF_UPDATE_COMMAND ||
			readObject(join(agentDir, "settings.json"))?.selfUpdateCommand
		)
			throw new Error(
				"A custom self-update command prevents safely targeting this installation",
			);
		return make(origin.file, ["update"]);
	}
	const command = resolveCommand(origin.manager, options.cwd, env.PATH);
	if (!command)
		throw new Error(
			`${origin.manager} is not available to update this installation`,
		);
	const spec = `${origin.packageName}@${version}`;
	if (origin.manager === "npm")
		return make(command, [
			"install",
			"-g",
			"--prefix",
			origin.root,
			...(install.family === "pi"
				? ["--ignore-scripts"]
				: ["--allow-scripts=pi-bolt"]),
			spec,
		]);
	if (origin.manager === "bun") {
		const listing = stripVTControlCharacters(
			await probe(command, ["pm", "ls", "-g"], env, origin.root),
		);
		const reportedRoot = /^(.+) node_modules \(/m.exec(listing)?.[1];
		const reportedBin = await probe(
			command,
			["pm", "bin", "-g"],
			env,
			origin.root,
		);
		if (
			!reportedRoot ||
			!sameFile(reportedRoot, origin.root) ||
			!sameFile(reportedBin, origin.binDir) ||
			!sameFile(join(reportedBin, install.family), origin.file)
		)
			throw new Error(
				"The selected command is not this global Bun installation",
			);
		env.BUN_INSTALL_GLOBAL_DIR = origin.root;
		env.BUN_INSTALL_BIN = origin.binDir;
		return make(command, [
			"add",
			"-g",
			...(install.family === "pi" ? ["--ignore-scripts"] : ["--trust"]),
			spec,
		]);
	}
	const flags = [
		`--config.global-dir=${origin.root}`,
		`--config.global-bin-dir=${origin.binDir}`,
	];
	const reported = await probe(
		command,
		["root", "-g", ...flags],
		env,
		origin.root,
	);
	const expected = join(
		origin.root,
		origin.layout,
		...(origin.layout === "5" ? ["node_modules"] : []),
	);
	if (!sameFile(reported, expected))
		throw new Error("pnpm's global layout does not match this installation");
	// why: a versioned selector matches no pnpm install group; add -g would replace the group and remove its other tools, so update the group's package by name.
	return make(command, [
		"update",
		"-g",
		...flags,
		"--latest",
		origin.packageName,
	]);
}
