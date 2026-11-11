import { execFile } from "node:child_process";
import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import type { BackendConfig } from "./backend.ts";

export type Family = "pi" | "pi-bolt";
export type BackendInstall = {
	family: Family;
	version: string;
	id: string;
};

const PROBE_TIMEOUT_MS = 10_000;

function isExecutable(path: string) {
	try {
		if (!statSync(path).isFile()) return false;
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function resolveCommand(
	command: string,
	cwd: string,
	pathVar: string | undefined,
) {
	const candidates = command.includes("/")
		? [resolve(cwd, command)]
		: (pathVar ?? "")
				.split(delimiter)
				.filter(Boolean)
				.map((dir) => join(dir, command));
	const found = candidates.find(isExecutable);
	return found && realpathSync(found);
}

// why: Pi-Bolt prints the Pi it is built on first and its own version in parentheses ("1.5.2 (Pi-Bolt 1.2.1, linux-x64, JIT off)"), so reading the first version would report stock Pi.
export function parseVersionOutput(
	output: string,
): { family: Family; version: string } | undefined {
	const line =
		output
			.split("\n")
			.find((text) => text.trim())
			?.trim() ?? "";
	const bolt = /^\d+\.\d+\.\d+\S*\s+\(Pi-Bolt (\d+\.\d+\.\d+)[,)]/.exec(line);
	if (bolt?.[1]) return { family: "pi-bolt", version: bolt[1] };
	const pi = /^(\d+\.\d+\.\d+)$/.exec(line);
	return pi?.[1] ? { family: "pi", version: pi[1] } : undefined;
}

function run(
	command: string,
	args: string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
) {
	return new Promise<string | undefined>((done) => {
		execFile(
			command,
			args,
			{ cwd, env, timeout: PROBE_TIMEOUT_MS, encoding: "utf8" },
			(error, stdout) => done(error ? undefined : stdout),
		);
	});
}

export async function detectInstall(
	config: BackendConfig,
	options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<BackendInstall | undefined> {
	const file = resolveCommand(config.command, options.cwd, options.env.PATH);
	if (!file) return undefined;
	const output = await run(
		config.command,
		[...config.args, "--version"],
		options.cwd,
		options.env,
	);
	const parsed = output === undefined ? undefined : parseVersionOutput(output);
	return parsed && { ...parsed, id: `${parsed.family}:${file}` };
}
