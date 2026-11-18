import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support";
import { channelTitle } from "./channel.ts";
import { type Config, fieldError, parseBindingValue } from "./config.ts";
import type { KeybindingAction } from "./keybindings.ts";
import type {
	Command,
	CommandContext,
	Extension,
	Module,
	PlacedModule,
	SettingsTab,
} from "./module.ts";
import { StartupError } from "./startup-error.ts";

// why: a personal Extension has no node_modules, so its solid-js, solid-js/store and @opentui/* imports must resolve to the app's own instances.
ensureRuntimePluginSupport();

export const builtinDir = join(import.meta.dir, "../builtin");

export type ExtensionFolders = ReadonlyMap<string, string>;

export type OwnedCommand = {
	readonly command: Command;
	readonly extension: string;
};

export type LoadedKeybindingAction = KeybindingAction & {
	run(context: CommandContext): void;
};

export type ResolvedPlacement = {
	panels: Map<string, PlacedModule[]>;
	commands: OwnedCommand[];
	settingsTabs: SettingsTab[];
	channelTitles: string[];
	piExtensions: string[];
	keybindingActions: LoadedKeybindingAction[];
	enabledExtensions: ReadonlySet<string>;
};

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
	config: Pick<Config, "placement" | "modules">,
	folders: ExtensionFolders,
): Promise<ResolvedPlacement> {
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
	return {
		panels,
		commands,
		settingsTabs: [...extensions.values()].flatMap(
			(extension) => extension.settingsTabs ?? [],
		),
		channelTitles: [...extensions].flatMap(([name, extension]) =>
			(extension.channels ?? []).map((channel) => channelTitle(name, channel)),
		),
		piExtensions: [...folders]
			.filter(([name]) => extensions.has(name))
			.map(([, dir]) => join(dir, "pi-extension.ts"))
			.filter((path) => existsSync(path)),
		keybindingActions: collectKeybindingActions(extensions),
		enabledExtensions: new Set(extensions.keys()),
	};
}

function collectCommands(
	extensions: ReadonlyMap<string, Extension>,
): OwnedCommand[] {
	const owners = new Map<string, string>();
	const commands: OwnedCommand[] = [];
	for (const [name, extension] of extensions) {
		for (const command of extension.commands ?? []) {
			const owner = owners.get(command.name);
			if (owner) {
				throw new StartupError(
					`Command "/${command.name}" is defined by both Extension "${owner}" and "${name}"`,
				);
			}
			owners.set(command.name, name);
			commands.push({ command, extension: name });
		}
	}
	return commands;
}

function collectKeybindingActions(
	extensions: ReadonlyMap<string, Extension>,
): LoadedKeybindingAction[] {
	const ids = new Set<string>();
	const actions: LoadedKeybindingAction[] = [];
	for (const [extensionName, extension] of extensions) {
		if (extension.keybindingActions === undefined) continue;
		if (extensionName === "command") {
			throw new StartupError(
				'Extension "command" cannot declare keybinding actions: "command." is reserved for command actions',
			);
		}
		if (!Array.isArray(extension.keybindingActions)) {
			throw new StartupError(
				`Extension "${extensionName}" keybindingActions: expected an array`,
			);
		}
		for (const [index, value] of extension.keybindingActions.entries()) {
			const field = `keybindingActions[${index}]`;
			const declared = isObject(value) ? value : undefined;
			if (!declared) {
				throw new StartupError(
					`Extension "${extensionName}" ${field}: expected an object`,
				);
			}
			const name = declared.name;
			if (
				typeof name !== "string" ||
				name.length === 0 ||
				name.includes(".") ||
				/\s/.test(name)
			) {
				throw new StartupError(
					`Extension "${extensionName}" ${field}.name: expected a non-empty name without a dot or space`,
				);
			}
			const description = declared.description;
			if (typeof description !== "string" || description.trim().length === 0) {
				throw new StartupError(
					`Extension "${extensionName}" ${field}.description: expected a non-empty description`,
				);
			}
			const defaultBindings = declared.defaultBindings;
			if (!Array.isArray(defaultBindings)) {
				throw new StartupError(
					`Extension "${extensionName}" ${field}.defaultBindings: expected an array of strings`,
				);
			}
			if (typeof declared.run !== "function") {
				throw new StartupError(
					`Extension "${extensionName}" ${field}.run: expected a function`,
				);
			}
			const id = `${extensionName}.${name}`;
			if (ids.has(id)) {
				throw new StartupError(
					`Extension "${extensionName}" ${field}: keybinding action "${id}" is declared twice`,
				);
			}
			ids.add(id);
			actions.push({
				id,
				description,
				source: { kind: "extension", name: extensionName },
				defaults: parseBindingValue(
					defaultBindings,
					id,
					`Extension "${extensionName}".${field}.defaultBindings`,
				),
				run: declared.run as LoadedKeybindingAction["run"],
			});
		}
	}
	return actions;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
	const tabs = extension.settingsTabs;
	if (
		tabs !== undefined &&
		(!Array.isArray(tabs) ||
			tabs.some(
				(tab) =>
					typeof tab?.title !== "string" || typeof tab.render !== "function",
			))
	) {
		throw new StartupError(
			`Extension "${name}" (${dir}) must define settingsTabs as [{ title, render }]`,
		);
	}
	return extension;
}
