import { execFile } from "node:child_process";
import type { BackendConfig } from "./backend.ts";
import { resolveCommand } from "./backend-command.ts";
import { acquireProbeLock, type InstallLease } from "./install-lock.ts";
import { installOrigin } from "./install-origin.ts";

export type Family = "pi" | "pi-bolt";
export type BackendInstall = {
	family: Family;
	version: string;
	id: string;
};

const PROBE_TIMEOUT_MS = 10_000;
const probes = new Map<string, Promise<void>>();

type ProbeOptions = {
	cwd: string;
	env: NodeJS.ProcessEnv;
	timeoutMs?: number;
	onStderr?(text: string): void;
	lease?: InstallLease;
};

export async function prepareBackendLease(
	config: BackendConfig,
	options: { cwd: string; env: NodeJS.ProcessEnv },
) {
	const origin = installOrigin(config, options);
	if (origin?.family !== "pi-bolt" || origin.manager === "curl")
		return undefined;
	const lease = await acquireProbeLock(origin.root);
	try {
		const install = await detectInstall(config, {
			...options,
			lease,
			timeoutMs: 30 * 60 * 1000,
		});
		if (install?.family !== "pi-bolt")
			throw new Error("Cannot prepare the installed Pi-Bolt native build");
		return lease;
	} catch (error) {
		lease.close();
		throw error;
	}
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

function run(command: string, args: string[], options: ProbeOptions) {
	return new Promise<string | undefined>((done) => {
		const child = execFile(
			command,
			args,
			{
				cwd: options.cwd,
				env: options.env,
				timeout: options.timeoutMs ?? PROBE_TIMEOUT_MS,
				encoding: "utf8",
			},
			(error, stdout) => done(error ? undefined : stdout),
		);
		if (options.onStderr)
			child.stderr?.setEncoding("utf8").on("data", options.onStderr);
	});
}

export async function detectInstall(
	config: BackendConfig,
	options: ProbeOptions,
): Promise<BackendInstall | undefined> {
	const file = resolveCommand(config.command, options.cwd, options.env.PATH);
	if (!file) return undefined;
	const root = installOrigin(config, options)?.root ?? file;
	if (options.lease && options.lease.root !== root)
		throw new Error("The Backend installation changed; retry /update");
	let releaseProbe: (() => void) | undefined;
	if (!options.lease) {
		const previous = probes.get(root);
		const { promise, resolve } = Promise.withResolvers<void>();
		probes.set(root, promise);
		await previous;
		releaseProbe = () => {
			resolve();
			if (probes.get(root) === promise) probes.delete(root);
		};
	}
	let lease: InstallLease | undefined;
	try {
		lease = options.lease ?? (await acquireProbeLock(root));
		const output = await run(
			config.command,
			[...config.args, "--version"],
			options,
		);
		const parsed =
			output === undefined ? undefined : parseVersionOutput(output);
		return parsed && { ...parsed, id: `${parsed.family}:${file}` };
	} finally {
		if (!options.lease) lease?.close();
		releaseProbe?.();
	}
}
