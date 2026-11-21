import { mkdirSync, rmdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { BackendConfig } from "./backend.ts";
import {
	backendAgentDir,
	backendEnvironment,
	commandPath,
	expandPath,
} from "./backend-command.ts";
import { saveExtensionSettings } from "./config.ts";
import {
	type AgenticRow,
	canonical,
	isInside,
	packageSource,
	readSettings,
} from "./extension-inventory.ts";
import { type ExtensionFolders, extensionActions } from "./extensions.ts";
import { isRecord } from "./json.ts";
import { writeJson } from "./json-file.ts";

export type ExtensionTarget =
	| AgenticRow
	| { kind: "interface"; name: string; removable: boolean };
export type ExtensionEdit = {
	target: ExtensionTarget;
	operation: "enable" | "disable" | "delete";
};

export function extensionEditKey(target: ExtensionTarget) {
	const id =
		target.kind === "package"
			? target.source
			: target.kind === "file"
				? target.path
				: target.name;
	return `${target.kind}:${id}`;
}

export function extensionDeletionLabel(target: ExtensionTarget) {
	return target.kind === "package"
		? `Package: ${target.source}`
		: target.kind === "file"
			? `Pi extension file: ${target.path}`
			: `Personal Extension: ${target.name}`;
}

export function canDeleteExtension(target: ExtensionTarget) {
	return target.kind === "package"
		? !target.source.trimStart().startsWith("-")
		: target.kind !== "builtin" && target.removable;
}

type Location = {
	path: string;
	cwd: string;
	backend: BackendConfig;
	env: NodeJS.ProcessEnv;
	folders(): ExtensionFolders;
};

export async function saveExtensions(
	location: Location,
	edits: readonly ExtensionEdit[],
	committed: (edit: ExtensionEdit) => void,
) {
	const agentic: ExtensionEdit[] = [];
	const packages: string[] = [];
	for (const edit of edits) {
		const { target, operation } = edit;
		if (operation === "delete" && !canDeleteExtension(target))
			throw new Error(`Cannot delete ${target.name}`);
		if (target.kind === "interface") {
			if (operation === "delete") {
				const root = join(dirname(location.path), "extensions");
				const dir = location.folders().get(target.name);
				if (!dir || dirname(dir) !== root)
					throw new Error(`Not a personal Extension: ${target.name}`);
				const actions = await extensionActions(target.name, dir);
				saveExtensionSettings(location.path, [
					{ name: target.name, removeActions: actions },
				]);
				rmSync(dir, { recursive: true, force: true });
			} else {
				saveExtensionSettings(location.path, [
					{ name: target.name, enabled: operation === "enable" },
				]);
			}
			committed(edit);
		} else if (target.kind === "package" && operation === "delete")
			packages.push(target.source);
		else agentic.push(edit);
	}
	if (agentic.length === 0 && packages.length === 0) return;
	const env = backendEnvironment(location.backend, location.env);
	const dir = backendAgentDir(location.cwd, env);
	for (const edit of agentic) {
		const { target, operation } = edit;
		writePiSettings(dir, env.HOME ?? homedir(), target, operation);
		committed(edit);
	}
	for (const source of packages) {
		await removePackage(location, dir, env, source);
		const edit = edits.find(
			({ target }) => target.kind === "package" && target.source === source,
		);
		if (edit) committed(edit);
	}
}

function writePiSettings(
	dir: string,
	home: string,
	target: ExtensionTarget,
	operation: ExtensionEdit["operation"],
) {
	const file = join(dir, "settings.json");
	const lock = `${file}.lock`;
	mkdirSync(dir, { recursive: true });
	// why: Pi's proper-lockfile uses this directory with realpath disabled. Fail rather than overwrite Pi's update if it owns the lock.
	mkdirSync(lock);
	try {
		const { value, error } = readSettings(file);
		if (error) throw new Error(error);
		if (target.kind === "package") {
			const packages = value.packages;
			if (
				!Array.isArray(packages) ||
				!packages.some((entry) => packageSource(entry) === target.source)
			)
				throw new Error(
					`Package is no longer in Pi settings: ${target.source}`,
				);
			value.packages = packages.map((entry) => {
				if (packageSource(entry) !== target.source) return entry;
				const settings: Record<string, unknown> = isRecord(entry)
					? entry
					: { source: target.source };
				if (operation === "disable") return { ...settings, extensions: [] };
				const { extensions: _filter, ...rest } = settings;
				return rest.autoload === false
					? { ...rest, extensions: ["**/*"] }
					: rest;
			});
			writeJson(file, value, 2);
			return;
		}
		if (target.kind === "interface") throw new Error("Expected a Pi extension");
		const id = target.kind === "file" ? target.path : target.name;
		const path = target.kind === "file" ? resolve(dir, target.path) : undefined;
		if (
			operation === "delete" &&
			(!path ||
				!isInside(resolve(dir), path) ||
				!isInside(canonical(dir), canonical(path)))
		)
			throw new Error(`Not a personal Pi extension file: ${id}`);
		const entries = value.extensions ?? [];
		if (!Array.isArray(entries))
			throw new Error(`${file}: extensions must be an array`);
		const matches = (candidate: string) => {
			if (!path) return id === candidate;
			try {
				return (
					canonical(resolve(dir, expandPath(candidate, home, true))) ===
					canonical(path)
				);
			} catch {
				return false;
			}
		};
		const next = entries.filter((entry) => {
			if (typeof entry !== "string") return true;
			if (entry.startsWith("-")) return !matches(entry.slice(1));
			if (operation !== "delete" || entry.startsWith("!")) return true;
			return !matches(entry.startsWith("+") ? entry.slice(1) : entry);
		});
		if (operation === "disable") next.push(`-${id}`);
		if (
			operation === "enable" &&
			next.some((entry) => {
				if (typeof entry !== "string" || !entry.startsWith("!")) return false;
				try {
					const glob = new Bun.Glob(entry.slice(1).replace(/^\.\//, ""));
					return (
						glob.match(id) ||
						(path && (glob.match(path) || glob.match(basename(path))))
					);
				} catch {
					return false;
				}
			})
		)
			next.push(`+${id}`);
		value.extensions = next;
		if (operation === "delete" && Array.isArray(value.packages)) {
			value.packages = value.packages.filter((entry) => {
				const source = packageSource(entry);
				return !source || !matches(source);
			});
		}
		writeJson(file, value, 2);
		if (operation === "delete" && path) rmSync(path, { force: true });
	} finally {
		rmdirSync(lock);
	}
}

async function removePackage(
	location: Location,
	dir: string,
	env: NodeJS.ProcessEnv,
	source: string,
) {
	const { value, error } = readSettings(join(dir, "settings.json"));
	if (error) throw new Error(error);
	if (
		!Array.isArray(value.packages) ||
		!value.packages.some((entry) => packageSource(entry) === source)
	)
		return;
	const { command, args } = location.backend;
	const withEnv = basename(command) === "env";
	const launcher = withEnv
		? args.findIndex((arg) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(arg))
		: -1;
	const executable = withEnv ? args[launcher] : command;
	if (!executable) throw new Error("Backend command is missing after env");
	const entrypoint =
		commandPath(executable, location.cwd, env.PATH) ?? executable;
	const script = ["node", "bun"].includes(basename(entrypoint))
		? args[launcher + 1]
		: undefined;
	const removeSource = /^[./~]|^file:\/\//.test(source)
		? resolve(dir, expandPath(source, env.HOME ?? homedir(), true))
		: source;
	const proc = Bun.spawn(
		[
			entrypoint,
			...(script && !script.startsWith("-")
				? [resolve(location.cwd, script)]
				: []),
			"remove",
			removeSource,
		],
		{
			cwd: location.cwd,
			env,
			stdin: "ignore",
			stdout: "ignore",
			stderr: "pipe",
		},
	);
	const [status, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stderr).text(),
	]);
	if (status !== 0)
		throw new Error(
			`Could not remove ${source}: ${stderr.trim() || `exit ${status}`}`,
		);
}
