import { mkdirSync, rmdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { BackendConfig } from "./backend.ts";
import {
	backendAgentDir,
	backendEnvironment,
	backendSubcommand,
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
import { packageStash } from "./package-stash.ts";

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
	stash: string;
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
	const stash = packageStash(location.stash, join(dir, "settings.json"));
	for (const edit of agentic) {
		const { target, operation } = edit;
		writePiSettings(dir, env.HOME ?? homedir(), stash, target, operation);
		committed(edit);
	}
	for (const source of packages) {
		await removePackage(location, dir, env, source);
		stash.set(source, undefined);
		const edit = edits.find(
			({ target }) => target.kind === "package" && target.source === source,
		);
		if (edit) committed(edit);
	}
}

type PackageStash = ReturnType<typeof packageStash>;

function writePiSettings(
	dir: string,
	home: string,
	stash: PackageStash,
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
			writePackage(file, value, stash, target, operation);
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

function writePackage(
	file: string,
	value: Record<string, unknown>,
	stash: PackageStash,
	{ source, singleFile }: Extract<AgenticRow, { kind: "package" }>,
	operation: ExtensionEdit["operation"],
) {
	const packages = Array.isArray(value.packages) ? [...value.packages] : [];
	const index = packages.findIndex((entry) => packageSource(entry) === source);
	const saved = stash.all()[source];
	const write = () => {
		value.packages = packages;
		writeJson(file, value, 2);
	};
	if (operation === "enable" && saved && !("written" in saved)) {
		// why: a package the user added back while it was disabled is theirs now.
		if (index < 0) {
			packages.splice(Math.min(saved.index, packages.length), 0, saved.entry);
			write();
		}
		stash.set(source, undefined);
		return;
	}
	if (index < 0)
		throw new Error(`Package is no longer in Pi settings: ${source}`);
	const entry = packages[index];
	if (operation === "disable") {
		if (singleFile) {
			stash.set(source, { entry, index });
			packages.splice(index, 1);
		} else {
			const settings = isRecord(entry) ? entry : { source };
			const written = { ...settings, extensions: [] };
			stash.set(source, { entry, index, written });
			packages[index] = written;
		}
		write();
		return;
	}
	if (saved && Bun.deepEquals(entry, saved.written))
		packages[index] = saved.entry;
	else {
		const settings: Record<string, unknown> = isRecord(entry)
			? entry
			: { source };
		const { extensions: _filter, ...rest } = settings;
		packages[index] =
			rest.autoload === false ? { ...rest, extensions: ["**/*"] } : rest;
	}
	write();
	stash.set(source, undefined);
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
	const removeSource = /^[./~]|^file:\/\//.test(source)
		? resolve(dir, expandPath(source, env.HOME ?? homedir(), true))
		: source;
	const proc = Bun.spawn(
		backendSubcommand(location.backend, location.cwd, env, [
			"remove",
			removeSource,
		]),
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
