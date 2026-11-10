import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { type Config, fieldError } from "./config.ts";
import type { Command, Extension, Module, PlacedModule } from "./module.ts";
import { StartupError } from "./startup-error.ts";

export const builtinDir = join(import.meta.dir, "../builtin");

export type ExtensionFolders = ReadonlyMap<string, string>;

export function findExtensions(roots: readonly string[]): ExtensionFolders {
	const folders = new Map<string, string>();
	for (const root of roots) {
		for (const name of extensionNames(root)) {
			const path = join(root, name);
			const existing = folders.get(name);
			if (existing) {
				throw new StartupError(
					`Extension "${name}" exists in both ${existing} and ${path}`,
				);
			}
			folders.set(name, path);
		}
	}
	return folders;
}

function extensionNames(root: string) {
	if (!existsSync(root)) return [];
	return readdirSync(root).filter((name) =>
		statSync(join(root, name)).isDirectory(),
	);
}

export async function resolvePlacement(
	config: Pick<Config, "placement" | "modules">,
	folders: ExtensionFolders,
): Promise<{ panels: Map<string, PlacedModule[]>; commands: Command[] }> {
	const extensions = new Map<string, Extension>();
	const placedIds = new Set<string>();
	const panels = new Map<string, PlacedModule[]>();

	async function findModule(id: string, path: string): Promise<Module> {
		const dot = id.indexOf(".");
		if (dot < 0) {
			throw fieldError(
				path,
				`unknown Module "${id}", expected <extension>.<module>`,
			);
		}
		const name = id.slice(0, dot);
		const dir = folders.get(name);
		if (!dir) {
			throw fieldError(
				path,
				`unknown Module "${id}", no Extension named "${name}"`,
			);
		}
		let extension = extensions.get(name);
		if (!extension) {
			extension = await loadExtension(name, dir);
			extensions.set(name, extension);
		}
		const module = extension.modules.find((m) => m.id === id.slice(dot + 1));
		if (!module) {
			const known = extension.modules.map((m) => `${name}.${m.id}`).join(", ");
			throw fieldError(
				path,
				`unknown Module "${id}", Extension "${name}" has: ${known}`,
			);
		}
		return module;
	}

	for (const [panelId, moduleIds] of Object.entries(config.placement)) {
		const placed: PlacedModule[] = [];
		for (const [index, id] of moduleIds.entries()) {
			const module = await findModule(id, `placement.${panelId}[${index}]`);
			placedIds.add(id);
			placed.push({ id, module, settings: config.modules[id] ?? {} });
		}
		panels.set(panelId, placed);
	}

	for (const id of Object.keys(config.modules)) {
		if (!placedIds.has(id)) {
			throw fieldError(
				`modules[${JSON.stringify(id)}]`,
				"this Module is not in the Placement",
			);
		}
	}
	return { panels, commands: collectCommands(extensions) };
}

function collectCommands(extensions: ReadonlyMap<string, Extension>) {
	const owners = new Map<string, string>();
	const commands: Command[] = [];
	for (const [name, extension] of extensions) {
		for (const command of extension.commands ?? []) {
			const owner = owners.get(command.name);
			if (owner) {
				throw new StartupError(
					`Command "/${command.name}" is defined by both Extension "${owner}" and "${name}"`,
				);
			}
			owners.set(command.name, name);
			commands.push(command);
		}
	}
	return commands;
}

async function loadExtension(name: string, dir: string): Promise<Extension> {
	let extension: Extension | undefined;
	try {
		extension = (await import(join(dir, "index.tsx"))).default;
	} catch (error) {
		throw new StartupError(
			`Extension "${name}" (${dir}) failed to load: ${(error as Error).message}`,
		);
	}
	if (!Array.isArray(extension?.modules)) {
		throw new StartupError(
			`Extension "${name}" (${dir}) must default-export { modules: [...] }`,
		);
	}
	return extension;
}
