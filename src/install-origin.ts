import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { BackendConfig } from "./backend.ts";
import { commandPath, resolveCommand } from "./backend-command.ts";
import type { Family } from "./backend-install.ts";

type Base = { family: Family; root: string; file: string; binDir: string };
export type InstallOrigin = Base &
	(
		| { manager: "curl" }
		| { manager: "npm"; packageName: string }
		| { manager: "bun"; packageName: string }
		| {
				manager: "pnpm";
				packageName: string;
				layout: string;
				project: string;
		  }
	);

export function readObject(file: string): Record<string, unknown> | undefined {
	try {
		const value: unknown = JSON.parse(readFileSync(file, "utf8"));
		return typeof value === "object" && value !== null && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
}

export function sameFile(left: string, right: string) {
	try {
		return realpathSync(left) === realpathSync(right);
	} catch {
		return false;
	}
}

function packageAt(file: string, name: string, bin: string) {
	for (let dir = dirname(file); dirname(dir) !== dir; dir = dirname(dir)) {
		const manifest = readObject(join(dir, "package.json"));
		if (manifest?.name !== name) continue;
		const bins = manifest.bin;
		const entry =
			typeof bins === "string"
				? bins
				: typeof bins === "object" && bins !== null && bin in bins
					? Reflect.get(bins, bin)
					: undefined;
		if (typeof entry === "string" && sameFile(join(dir, entry), file))
			return dir;
	}
}

function shimTarget(file: string, name: string, bin: string) {
	if (statSync(file).size > 65536) return undefined;
	const script = readFileSync(file, "utf8");
	if (!script.startsWith("#!/bin/sh")) return undefined;
	for (const match of [
		...script.matchAll(/^# cmd-shim-target=(.+)$/gm),
		...script.matchAll(/"([^"\n]+)"\s+"\$@"/g),
	]) {
		const text = match[1]?.replace(
			/^\$basedir(?:_win)?\//,
			`${dirname(file)}/`,
		);
		if (!text || !isAbsolute(text) || text.includes("$")) continue;
		const target = resolve(text);
		const dir = packageAt(target, name, bin);
		if (dir) return { file: target, dir };
	}
}

export function installOrigin(
	config: BackendConfig,
	options: { cwd: string; env: NodeJS.ProcessEnv },
): InstallOrigin | undefined {
	const file = resolveCommand(config.command, options.cwd, options.env.PATH);
	if (!file) return undefined;
	const managed = join(dirname(dirname(file)), "install");
	const marker = readObject(join(managed, "managed-install.json"));
	if (
		basename(dirname(file)) === "bin" &&
		marker?.kind === "pi-managed-install" &&
		marker.schemaVersion === 1 &&
		marker.layout === "releases-v1"
	) {
		return {
			manager: "curl",
			family: "pi",
			root: realpathSync(managed),
			file,
			binDir: dirname(file),
		};
	}
	for (const family of ["pi", "pi-bolt"] as const) {
		const packageName =
			family === "pi" ? "@earendil-works/pi-coding-agent" : "pi-bolt";
		const dir = packageAt(file, packageName, family);
		const pkg = dir ? { file, dir } : shimTarget(file, packageName, family);
		if (!pkg) continue;
		const pnpm = /^(.*)\/(5|v\d+)(?:\/([^/]+))?\/node_modules\//.exec(pkg.dir);
		if (pnpm?.[1] && pnpm[2]) {
			const project = join(pnpm[1], pnpm[2], ...(pnpm[3] ? [pnpm[3]] : []));
			const dependencies = readObject(
				join(project, "package.json"),
			)?.dependencies;
			if (
				typeof dependencies === "object" &&
				dependencies !== null &&
				packageName in dependencies &&
				existsSync(join(project, "pnpm-lock.yaml"))
			) {
				return {
					manager: "pnpm",
					family,
					root: realpathSync(pnpm[1]),
					file,
					binDir: dirname(file),
					packageName,
					layout: pnpm[2],
					project: realpathSync(project),
				};
			}
		}
		const modules = pkg.dir.slice(0, -(packageName.length + 1));
		if (basename(modules) !== "node_modules") continue;
		const root = dirname(modules);
		const selected = commandPath(config.command, options.cwd, options.env.PATH);
		if (!selected) continue;
		if (
			existsSync(join(root, "bun.lock")) ||
			existsSync(join(root, "bun.lockb")) ||
			/\/install\/global$/.test(root)
		) {
			return {
				manager: "bun",
				family,
				root: realpathSync(root),
				file,
				binDir: dirname(selected),
				packageName,
			};
		}
		if (
			basename(root) === "lib" &&
			!existsSync(join(modules, ".modules.yaml")) &&
			sameFile(join(dirname(root), "bin", family), pkg.file)
		) {
			return {
				manager: "npm",
				family,
				root: realpathSync(dirname(root)),
				file,
				binDir: join(dirname(root), "bin"),
				packageName,
			};
		}
	}
	if (
		/^pi-bolt-(linux|darwin)-(x64|arm64)(-(baseline|jit|musl))*$/.test(
			basename(dirname(file)),
		) &&
		!/\/(Cellar|mise|npm|node_modules)\//.test(file)
	) {
		return {
			manager: "curl",
			family: "pi-bolt",
			root: realpathSync(dirname(dirname(file))),
			file,
			binDir: dirname(file),
		};
	}
}
