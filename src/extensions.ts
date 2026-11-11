import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support";
import { channelTitle } from "./channel.ts";
import { type Config, defaultConfig, fieldError } from "./config.ts";
import { commandAction } from "./keybindings.ts";
import type { Command, Extension, Module, PlacedModule } from "./module.ts";
import { StartupError } from "./startup-error.ts";

// why: a personal Extension has no node_modules, so its solid-js, solid-js/store and @opentui/* imports must resolve to the app's own instances.
ensureRuntimePluginSupport();

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
	const names = readdirSync(root).filter((name) =>
		statSync(join(root, name)).isDirectory(),
	);
	for (const name of names) {
		if (name.includes(".")) {
			throw new StartupError(
				`Extension folder ${join(root, name)} has a dot in its name, so Modules in it can't be addressed as <extension>.<module>`,
			);
		}
	}
	return names;
}

export async function resolvePlacement(
	config: Pick<Config, "placement" | "modules" | "keybindings">,
	folders: ExtensionFolders,
): Promise<{
	panels: Map<string, PlacedModule[]>;
	commands: Command[];
	channelTitles: string[];
	piExtensions: string[];
}> {
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
	const commands = collectCommands(extensions);
	// why: a replaced Layout can leave a default key bound to a command whose Extension is no longer placed; that is not an error, so the default names stay known.
	const actions = new Set([
		...Object.keys(defaultConfig.keybindings),
		...commands.map((command) => commandAction(command.name)),
	]);
	for (const action of Object.keys(config.keybindings)) {
		if (!actions.has(action)) {
			throw fieldError(
				`keybindings.${action}`,
				`unknown action, expected one of: ${[...actions].join(", ")}`,
			);
		}
	}
	return {
		panels,
		commands,
		channelTitles: [...extensions].flatMap(([name, extension]) =>
			(extension.channels ?? []).map((channel) => channelTitle(name, channel)),
		),
		piExtensions: [...folders]
			.filter(([name]) => extensions.has(name))
			.map(([, dir]) => join(dir, "pi-extension.ts"))
			.filter((path) => existsSync(path)),
	};
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
