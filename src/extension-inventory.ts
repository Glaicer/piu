import {
	type Dirent,
	existsSync,
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
} from "node:fs";
import { homedir } from "node:os";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from "node:path";
import type { BackendConfig } from "./backend.ts";
import {
	backendAgentDir,
	backendEnvironment,
	expandPath,
} from "./backend-command.ts";
import { builtinDir, type ExtensionFolders } from "./extensions.ts";
import { isRecord } from "./json.ts";

export type ExtensionInventoryOptions = {
	cwd: string;
	backend: BackendConfig;
	env: NodeJS.ProcessEnv;
	folders: ExtensionFolders;
	enabledExtensions: ReadonlySet<string>;
};

export type AgenticRow = {
	name: string;
	state: "enabled" | "disabled" | "unavailable";
} & (
	| { kind: "file"; path: string }
	| { kind: "package"; source: string }
	| { kind: "builtin" }
);

export type InterfaceRow = {
	name: string;
	enabled: boolean;
	hasPiExtension: boolean;
};

export type ExtensionInventory = {
	agentic: readonly AgenticRow[];
	agenticError?: string;
	builtin: readonly InterfaceRow[];
	external: readonly InterfaceRow[];
};

// why: the four built-in Pi extensions are named in the Backend's own settings docs, and `-builtin:<name>` is how a user turns one off.
const builtinExtensions = ["mcp", "llama.cpp", "codemode", "tool-search"];

const extensionFile = /\.(ts|js)$/;
const kindOrder = { file: 0, package: 1, builtin: 2 } as const;

export function readExtensionInventory(
	options: ExtensionInventoryOptions,
): ExtensionInventory {
	const env = backendEnvironment(options.backend, options.env);
	const home = env.HOME ?? homedir();
	const groups = collectInterface(options.folders, options.enabledExtensions);
	const { rows, error } = agenticRows(options.cwd, home, env, groups.piFiles);
	return {
		agentic: rows,
		...(error === undefined ? {} : { agenticError: error }),
		builtin: groups.builtin,
		external: groups.external,
	};
}

function agenticRows(
	cwd: string,
	home: string,
	env: NodeJS.ProcessEnv,
	piFiles: ReadonlySet<string>,
): { rows: AgenticRow[]; error?: string } {
	let agentDir: string;
	try {
		agentDir = backendAgentDir(cwd, env);
	} catch (failure) {
		// why: an unresolvable agent dir hides the files but not the built-in Pi extensions, which do not live there.
		return {
			rows: builtinRows(splitFilters([])),
			error: message(failure),
		};
	}
	const settings = readSettings(join(agentDir, "settings.json"));
	const filters = splitFilters(strings(settings.value.extensions));
	const failures: string[] = [];
	const files = collectFiles(agentDir, home, filters, failures);
	// why: the same file can reach Pi through `extensions` and through a package, and the explicit and discovered rows are the ones a user recognizes; an Extension's own Pi file belongs to Interface, not here.
	const listed = new Set(files.map((file) => canonical(file.path)));
	const packages = uniquePackages(
		collectPackages(settings.value.packages, agentDir, home, failures),
		(path) => listed.has(path) || piFiles.has(path),
	);
	const rows = [
		...fileRows(agentDir, files, piFiles),
		...packages,
		...builtinRows(filters),
	].sort(compareRows);
	const error =
		settings.error ?? (failures.length > 0 ? failures.join("; ") : undefined);
	return { rows, ...(error === undefined ? {} : { error }) };
}

// why: two declarations can reach one file through a symlink, and Pi keeps the first of them by declaration order, its `enabled` flag included.
function uniquePackages(
	entries: readonly { path?: string; row: AgenticRow }[],
	skip: (path: string) => boolean,
) {
	const kept = new Map<string, AgenticRow>();
	const rest: AgenticRow[] = [];
	for (const entry of entries) {
		if (entry.path === undefined) {
			rest.push(entry.row);
			continue;
		}
		const path = canonical(entry.path);
		if (skip(path) || kept.has(path)) continue;
		kept.set(path, entry.row);
	}
	return [...rest, ...kept.values()];
}

function collectInterface(
	folders: ExtensionFolders,
	enabledExtensions: ReadonlySet<string>,
) {
	const builtin: InterfaceRow[] = [];
	const external: InterfaceRow[] = [];
	const piFiles = new Set<string>();
	for (const [name, dir] of folders) {
		const piExtension = join(dir, "pi-extension.ts");
		const hasPiExtension = existsSync(piExtension);
		if (hasPiExtension) piFiles.add(canonical(piExtension));
		const row = { name, enabled: enabledExtensions.has(name), hasPiExtension };
		if (dirname(dir) === builtinDir) builtin.push(row);
		else external.push(row);
	}
	const byName = (left: InterfaceRow, right: InterfaceRow) =>
		compareText(left.name, right.name);
	return {
		builtin: builtin.sort(byName),
		external: external.sort(byName),
		piFiles,
	};
}

type SettingsRead = {
	value: Record<string, unknown>;
	error?: string;
};

function readSettings(file: string): SettingsRead {
	let text: string;
	try {
		text = readFileSync(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT")
			return { value: {} };
		return { value: {}, error: `Cannot read ${file}: ${message(error)}` };
	}
	try {
		const value: unknown = JSON.parse(stripBom(text));
		if (isRecord(value)) return { value };
		return { value: {}, error: `${file} does not hold a JSON object` };
	} catch (error) {
		return { value: {}, error: `${file} is not valid JSON: ${message(error)}` };
	}
}

function message(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function stripBom(text: string) {
	return text.replace(/^\uFEFF/, "");
}

function strings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
}

function readManifest(root: string): Record<string, unknown> | undefined {
	try {
		const value: unknown = JSON.parse(
			stripBom(readFileSync(join(root, "package.json"), "utf8")),
		);
		return isRecord(value) ? value : undefined;
	} catch {
		return undefined;
	}
}

function piManifest(root: string): Record<string, unknown> | undefined {
	const pi = readManifest(root)?.pi;
	return isRecord(pi) ? pi : undefined;
}

function canonical(path: string) {
	try {
		return realpathSync(path);
	} catch {
		return toPosix(resolve(path));
	}
}

function toPosix(path: string) {
	return path.split(sep).join("/");
}

function normalizeExact(pattern: string) {
	const trimmed = pattern.trim();
	const withoutDot = trimmed.startsWith("./") ? trimmed.slice(2) : trimmed;
	return toPosix(withoutDot);
}

function matchesGlob(path: string, pattern: string) {
	const trimmed = pattern.startsWith("./") ? pattern.slice(2) : pattern;
	try {
		return new Bun.Glob(trimmed).match(path);
	} catch {
		return false;
	}
}

function matchesAny(
	path: string,
	baseDir: string,
	patterns: readonly string[],
) {
	if (patterns.length === 0) return false;
	const candidates = [
		toPosix(relative(baseDir, path)),
		basename(path),
		toPosix(resolve(path)),
	];
	return patterns.some((pattern) =>
		candidates.some((candidate) => matchesGlob(candidate, pattern)),
	);
}

function matchesExact(
	path: string,
	baseDir: string,
	patterns: readonly string[],
) {
	if (patterns.length === 0) return false;
	const candidates = [toPosix(relative(baseDir, path)), toPosix(resolve(path))];
	return patterns.some((pattern) => {
		const normalized = normalizeExact(pattern);
		return candidates.includes(normalized);
	});
}

type Filters = {
	adds: string[];
	excludes: string[];
	includes: string[];
	removes: string[];
};

function splitFilters(entries: readonly string[]): Filters {
	const filters: Filters = {
		adds: [],
		excludes: [],
		includes: [],
		removes: [],
	};
	for (const entry of entries) {
		if (entry.startsWith("+")) filters.includes.push(entry.slice(1));
		else if (entry.startsWith("-")) filters.removes.push(entry.slice(1));
		else if (entry.startsWith("!")) filters.excludes.push(entry.slice(1));
		else filters.adds.push(entry);
	}
	return filters;
}

// why: Pi applies every `!` exclusion first, then an exact `+` inclusion, then an exact `-` exclusion, so a `+` entry re-enables what a `!` dropped and `-` beats both.
function byOverrides(excluded: boolean, included: boolean, removed: boolean) {
	let enabled = true;
	if (excluded) enabled = false;
	if (included) enabled = true;
	if (removed) enabled = false;
	return enabled;
}

function enabledByFilters(path: string, baseDir: string, filters: Filters) {
	return byOverrides(
		matchesAny(path, baseDir, filters.excludes),
		matchesExact(path, baseDir, filters.includes),
		matchesExact(path, baseDir, filters.removes),
	);
}

type FileEntry = {
	path: string;
	enabled: boolean;
};

function collectFiles(
	agentDir: string,
	home: string,
	filters: Filters,
	failures: string[],
): FileEntry[] {
	const entries = new Map<string, FileEntry>();
	const add = (path: string) => {
		if (entries.has(canonical(path))) return;
		entries.set(canonical(path), {
			path,
			enabled: enabledByFilters(path, agentDir, filters),
		});
	};
	for (const entry of filters.adds) {
		try {
			for (const path of discover(
				resolve(agentDir, expandPath(entry, home, true)),
			))
				add(path);
		} catch (failure) {
			failures.push(`extensions "${entry}": ${message(failure)}`);
		}
	}
	for (const path of discover(join(agentDir, "extensions"))) add(path);
	return [...entries.values()];
}

// why: Pi reads extensions from an explicitly listed file, from a directory holding a `pi.extensions` manifest, `index.ts` or `index.js`, and otherwise from the `.ts`/`.js` files directly inside it and the entries of its subfolders; nothing deeper.
function discover(target: string, seen = new Set<string>()): string[] {
	const key = canonical(target);
	if (seen.has(key)) return [];
	seen.add(key);
	const stats = statsOf(target);
	if (stats?.isFile()) return [target];
	if (!stats?.isDirectory()) return [];
	return entryFiles(target, seen) ?? oneLevel(target, seen);
}

function entryFiles(root: string, seen: Set<string>): string[] | undefined {
	const declared = strings(piManifest(root)?.extensions);
	const found = declared.flatMap((entry) =>
		expandManifestEntry(entry, root, seen),
	);
	if (found.length > 0) return found;
	const indexTs = join(root, "index.ts");
	if (existsSync(indexTs)) return [indexTs];
	const indexJs = join(root, "index.js");
	if (existsSync(indexJs)) return [indexJs];
	return undefined;
}

function expandManifestEntry(entry: string, root: string, seen: Set<string>) {
	if (!/[*?{[\]]/.test(entry)) {
		const path = resolve(root, entry);
		const stats = statsOf(path);
		if (stats?.isFile()) return [path];
		return stats?.isDirectory() ? discover(path, seen) : [];
	}
	try {
		return [...new Bun.Glob(entry).scanSync({ cwd: root, absolute: true })]
			.filter((path) => {
				const rel = toPosix(relative(root, path));
				return rel.split("/").every((segment) => !segment.startsWith("."));
			})
			.sort(compareText)
			.flatMap((path) => discover(path, seen));
	} catch {
		return [];
	}
}

function oneLevel(dir: string, seen: Set<string>): string[] {
	const found: string[] = [];
	for (const entry of readDir(dir)) {
		if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
		const path = join(dir, entry.name);
		if (isFile(entry, path)) {
			if (extensionFile.test(entry.name)) found.push(path);
		} else if (isDirectory(entry, path)) {
			const nested = entryFiles(path, seen);
			if (nested) found.push(...nested);
		}
	}
	return found.sort(compareText);
}

function readDir(dir: string): Dirent[] {
	try {
		return readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
}

function statsOf(path: string) {
	try {
		return statSync(path);
	} catch {
		return undefined;
	}
}

function isDirectory(entry: Dirent, path: string) {
	if (entry.isDirectory()) return true;
	return entry.isSymbolicLink() && statsOf(path)?.isDirectory() === true;
}

function isFile(entry: Dirent, path: string) {
	if (entry.isFile()) return true;
	return entry.isSymbolicLink() && statsOf(path)?.isFile() === true;
}

function fileRows(
	agentDir: string,
	files: readonly FileEntry[],
	piFiles: ReadonlySet<string>,
): AgenticRow[] {
	return files
		.filter((file) => !piFiles.has(canonical(file.path)))
		.map((file) => ({
			kind: "file" as const,
			name: stripExtension(basename(file.path)),
			path: displayPath(agentDir, file.path),
			state: file.enabled ? ("enabled" as const) : ("disabled" as const),
		}));
}

function displayPath(agentDir: string, path: string) {
	const rel = relative(agentDir, path);
	const inside = rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
	return toPosix(inside ? rel : resolve(path));
}

function stripExtension(path: string) {
	return path.replace(extensionFile, "");
}

function collectPackages(
	packages: unknown,
	agentDir: string,
	home: string,
	failures: string[],
): { path?: string; row: AgenticRow }[] {
	if (!Array.isArray(packages)) return [];
	return packages.flatMap((entry) => {
		try {
			return packageRows(entry, agentDir, home);
		} catch (failure) {
			failures.push(`packages ${JSON.stringify(entry)}: ${message(failure)}`);
			return [];
		}
	});
}

function packageRows(
	entry: unknown,
	agentDir: string,
	home: string,
): { path?: string; row: AgenticRow }[] {
	const source =
		typeof entry === "string"
			? entry
			: isRecord(entry) && typeof entry.source === "string"
				? entry.source
				: undefined;
	if (!source) return [];
	const filter = isRecord(entry) ? entry : undefined;
	const extensions = filter ? strings(filter.extensions) : undefined;
	const empty = Array.isArray(filter?.extensions) && extensions?.length === 0;
	const missing = (): { row: AgenticRow }[] => [
		{
			row: {
				kind: "package",
				source,
				name: source,
				state: empty ? "disabled" : "unavailable",
			},
		},
	];
	const root = packageRoot(source, agentDir, home);
	if (!root) return missing();
	const stats = statsOf(root);
	if (!stats) return missing();
	if (stats.isFile())
		return [
			{
				path: root,
				row: {
					kind: "package",
					source,
					name: stripExtension(basename(root)),
					state: "enabled",
				},
			},
		];
	if (!stats.isDirectory()) return [];
	const allowed = packageEntries(root);
	if (allowed.length === 0) return [];
	const enabled =
		filter?.autoload === false
			? deltaFiltered(allowed, extensions ?? [], root)
			: filtered(allowed, extensions, root);
	return allowed.map((path) => ({
		path,
		row: {
			kind: "package" as const,
			source,
			name: stripExtension(packagePath(root, path)),
			state: enabled.has(path) ? ("enabled" as const) : ("disabled" as const),
		},
	}));
}

function packagePath(root: string, path: string) {
	const rel = toPosix(relative(root, path));
	return rel === "" ? basename(path) : rel;
}

function packageEntries(root: string): string[] {
	const declared = strings(piManifest(root)?.extensions);
	if (declared.length === 0) return discover(join(root, "extensions"));
	// why: a manifest that lists extensions narrows the package to exactly those files, its own `!`, `+` and `-` entries included, and Pi does not fall back to `index.ts` for it.
	const seen = new Set([canonical(root)]);
	const allowed = declared.flatMap((entry) =>
		expandManifestEntry(entry, root, seen),
	);
	const overrides = declared.filter((entry) => /^[!+-]/.test(entry));
	const enabled =
		overrides.length === 0
			? new Set(allowed)
			: filtered(allowed, overrides, root);
	return allowed.filter((path) => enabled.has(path));
}

function filtered(
	allowed: readonly string[],
	patterns: readonly string[] | undefined,
	root: string,
) {
	if (patterns === undefined) return new Set(allowed);
	if (patterns.length === 0) return new Set<string>();
	const { adds, excludes, includes, removes } = splitFilters(patterns);
	const steps: ((paths: string[]) => string[])[] = [];
	if (adds.length > 0)
		steps.push((paths) => paths.filter((path) => matchesAny(path, root, adds)));
	if (excludes.length > 0)
		steps.push((paths) =>
			paths.filter((path) => !matchesAny(path, root, excludes)),
		);
	if (includes.length > 0)
		steps.push((paths) => [
			...paths,
			...allowed.filter(
				(path) => !paths.includes(path) && matchesExact(path, root, includes),
			),
		]);
	if (removes.length > 0)
		steps.push((paths) =>
			paths.filter((path) => !matchesExact(path, root, removes)),
		);
	return new Set(steps.reduce((paths, step) => step(paths), [...allowed]));
}

// why: `autoload: false` starts with the package's extensions off and lets each filter entry turn the ones it matches on or off, the last matching entry winning.
function deltaFiltered(
	allowed: readonly string[],
	patterns: readonly string[],
	root: string,
) {
	const enabled = new Map<string, boolean>();
	for (const pattern of patterns) {
		const exact = pattern.startsWith("+") || pattern.startsWith("-");
		const target = exact ? pattern.slice(1) : pattern;
		const on = !pattern.startsWith("-") && !pattern.startsWith("!");
		for (const path of allowed)
			if (
				exact
					? matchesExact(path, root, [target])
					: matchesAny(path, root, [target])
			)
				enabled.set(path, on);
	}
	return new Set(allowed.filter((path) => enabled.get(path) === true));
}

function builtinRows(filters: Filters): AgenticRow[] {
	return builtinExtensions.map((name) => {
		const id = `builtin:${name}`;
		const enabled = byOverrides(
			filters.excludes.some((pattern) => matchesGlob(id, pattern)),
			filters.includes.some((pattern) => normalizeExact(pattern) === id),
			filters.removes.some((pattern) => normalizeExact(pattern) === id),
		);
		return {
			kind: "builtin" as const,
			name: id,
			state: enabled ? ("enabled" as const) : ("disabled" as const),
		};
	});
}

function packageRoot(source: string, agentDir: string, home: string) {
	if (source.startsWith("npm:"))
		return npmRoot(source.slice(4).trim(), agentDir);
	if (isLocalSource(source))
		return resolve(agentDir, expandPath(source, home, true));
	const git = parseGitSource(source);
	if (!git) return resolve(agentDir, expandPath(source, home, true));
	const root = join(agentDir, "git");
	const path = resolve(root, git.host, git.path);
	return isInside(root, path) ? path : undefined;
}

function isLocalSource(source: string) {
	const trimmed = source.trim();
	return ![
		"npm:",
		"git:",
		"github:",
		"http:",
		"https:",
		"ssh:",
		"builtin:",
	].some((prefix) => trimmed.startsWith(prefix));
}

function npmRoot(spec: string, agentDir: string) {
	const name = /^(@?[^@]+(?:\/[^@]+)?)(?:@(.+))?$/.exec(spec)?.[1];
	if (!name) return undefined;
	const root = join(agentDir, "npm", "node_modules");
	const path = resolve(root, name);
	return isInside(root, path) ? path : undefined;
}

function parseGitSource(source: string) {
	const trimmed = source.trim();
	const prefixed = trimmed.startsWith("git:");
	const url = prefixed ? trimmed.slice(4).trim() : trimmed;
	if (!prefixed && !/^(https?|ssh|git):\/\//i.test(url)) return undefined;
	const bare = (url.split("#")[0] ?? url)
		.replace(/^[a-z]+:\/\//i, "")
		.replace(/^git@/, "");
	const [host, ...rest] = bare.split("/");
	if (!host || rest.length === 0) return undefined;
	const path = (rest.join("/").split("@")[0] ?? "")
		.replace(/\/+$/, "")
		.replace(/\.git$/i, "");
	return { host, path };
}

function isInside(root: string, path: string) {
	const rel = relative(root, path);
	return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function compareText(left: string, right: string) {
	return left < right ? -1 : left > right ? 1 : 0;
}

function rowKey(row: AgenticRow) {
	return row.kind === "file"
		? row.path
		: row.kind === "package"
			? row.source
			: row.name;
}

function compareRows(left: AgenticRow, right: AgenticRow) {
	return (
		kindOrder[left.kind] - kindOrder[right.kind] ||
		compareText(left.name, right.name) ||
		compareText(rowKey(left), rowKey(right))
	);
}
