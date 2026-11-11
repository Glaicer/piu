import { existsSync, readFileSync } from "node:fs";
import type { BackendConfig } from "./backend.ts";
import { type Keybindings, parseChord } from "./keybindings.ts";
import type { Size, Slot } from "./layout.tsx";
import type { ModuleSettings } from "./module.ts";
import { StartupError } from "./startup-error.ts";

export type Placement = Readonly<Record<string, readonly string[]>>;

export type Config = {
	backend: BackendConfig;
	layout: Slot;
	placement: Placement;
	modules: Readonly<Record<string, ModuleSettings>>;
	keybindings: Keybindings;
	animations: boolean;
};

export const defaultConfig: Omit<Config, "keybindings"> & {
	keybindings: Readonly<Record<string, string>>;
} = {
	backend: { command: "pi", args: [] },
	layout: {
		kind: "container",
		id: "root",
		direction: "row",
		size: "rest",
		children: [
			{
				kind: "container",
				id: "main",
				direction: "column",
				size: "rest",
				children: [
					{ kind: "panel", id: "agent", direction: "column", size: "rest" },
					{
						kind: "container",
						id: "input-area",
						direction: "column",
						size: "content",
						children: [
							{
								kind: "panel",
								id: "input",
								direction: "column",
								size: "content",
							},
							{ kind: "panel", id: "status", direction: "row", size: 3 },
						],
					},
				],
			},
			{
				kind: "panel",
				id: "side",
				direction: "column",
				size: "33%",
				hideBelow: 120,
			},
		],
	},
	placement: {
		agent: ["chat.messages"],
		input: ["ask-user-question.card", "input.prompt"],
		status: ["model.current", "reasoning.level", "status.line"],
		side: [],
	},
	modules: {},
	animations: true,
	keybindings: {
		"focus.next": "tab",
		"focus.previous": "shift+tab",
		"input.newline": "ctrl+j",
		"command.model": "ctrl+l",
		"command.reasoning": "alt+t",
	},
};

type Fields = Record<string, unknown>;

export function loadConfig(path: string): Config {
	const user = readUserConfig(path);
	const panelIds = new Set<string>();
	const layout = parseSlot(
		"layout" in user ? user.layout : defaultConfig.layout,
		"layout",
		panelIds,
	);
	const defaultPlacement = Object.fromEntries(
		Object.entries(defaultConfig.placement).filter(([id]) => panelIds.has(id)),
	);
	return {
		backend: parseBackend(mergeObjects(defaultConfig.backend, user.backend)),
		layout,
		placement: parsePlacement(
			mergeObjects(defaultPlacement, user.placement),
			panelIds,
		),
		modules: parseModules(mergeObjects(defaultConfig.modules, user.modules)),
		keybindings: parseKeybindings(
			mergeObjects(defaultConfig.keybindings, user.keybindings),
		),
		animations: boolean(
			user.animations ?? defaultConfig.animations,
			"animations",
		),
	};
}

function readUserConfig(path: string): Fields {
	if (!existsSync(path)) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		throw new StartupError(`${path}: ${(error as Error).message}`);
	}
	return object(parsed, "config");
}

function mergeObjects(base: Fields, over: unknown): unknown {
	if (over === undefined) return base;
	if (!isObject(over)) return over;
	const merged: Fields = { ...base };
	for (const [key, value] of Object.entries(over)) {
		const current = base[key];
		merged[key] = isObject(current) ? mergeObjects(current, value) : value;
	}
	return merged;
}

function parseBackend(value: unknown): BackendConfig {
	const fields = object(value, "backend");
	return {
		command: string(fields.command, "backend.command"),
		args: stringArray(fields.args, "backend.args"),
	};
}

function parseSlot(value: unknown, path: string, panelIds: Set<string>): Slot {
	const fields = object(value, path);
	const kind = fields.kind;
	if (kind !== "container" && kind !== "panel") {
		throw fieldError(
			`${path}.kind`,
			`expected "container" or "panel", got ${JSON.stringify(kind)}`,
		);
	}
	const base = {
		id: string(fields.id, `${path}.id`),
		direction: direction(fields.direction, `${path}.direction`),
		size: parseSize(fields.size, `${path}.size`),
		...optionalCells(fields, "minSize", path),
		...optionalCells(fields, "hideBelow", path),
	};
	if (kind === "panel") {
		if (panelIds.has(base.id)) {
			throw fieldError(`${path}.id`, `Panel id "${base.id}" is already used`);
		}
		panelIds.add(base.id);
		return { kind, ...base };
	}
	return {
		kind,
		...base,
		children: array(fields.children, `${path}.children`).map((child, index) =>
			parseSlot(child, `${path}.children[${index}]`, panelIds),
		),
	};
}

function parseSize(value: unknown, path: string): Size {
	if (value === "rest" || value === "content") return value;
	if (isCells(value)) return value;
	if (isPercent(value)) return value;
	throw fieldError(
		path,
		`expected a cell count, a percentage like "33%", "rest" or "content", got ${JSON.stringify(value)}`,
	);
}

function optionalCells(
	fields: Fields,
	key: "minSize" | "hideBelow",
	path: string,
) {
	const value = fields[key];
	if (value === undefined) return {};
	if (isCells(value)) return { [key]: value };
	throw fieldError(
		`${path}.${key}`,
		`expected a positive whole number of cells, got ${JSON.stringify(value)}`,
	);
}

function isCells(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isPercent(value: unknown): value is `${number}%` {
	if (typeof value !== "string" || !/^\d+(\.\d+)?%$/.test(value)) {
		return false;
	}
	const percent = Number.parseFloat(value);
	return percent > 0 && percent <= 100;
}

function direction(value: unknown, path: string): "row" | "column" {
	if (value === "row" || value === "column") return value;
	throw fieldError(
		path,
		`expected "row" or "column", got ${JSON.stringify(value)}`,
	);
}

function parsePlacement(value: unknown, panelIds: ReadonlySet<string>) {
	const fields = object(value, "placement");
	return Object.fromEntries(
		Object.entries(fields).map(([panelId, moduleIds]) => {
			const path = `placement.${panelId}`;
			if (!panelIds.has(panelId)) {
				throw fieldError(path, "no Panel with this id in the Layout");
			}
			return [panelId, stringArray(moduleIds, path)];
		}),
	);
}

function parseModules(value: unknown) {
	return Object.fromEntries(
		Object.entries(object(value, "modules")).map(([id, settings]) => [
			id,
			object(settings, `modules[${JSON.stringify(id)}]`),
		]),
	);
}

function parseKeybindings(value: unknown): Keybindings {
	return Object.fromEntries(
		Object.entries(object(value, "keybindings")).map(([action, spec]) => {
			const path = `keybindings.${action}`;
			const chord = parseChord(string(spec, path));
			if (!chord) {
				throw fieldError(
					path,
					`expected a key like "ctrl+j" or "shift+tab", got ${JSON.stringify(spec)}`,
				);
			}
			return [action, chord];
		}),
	);
}

function isObject(value: unknown): value is Fields {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown) {
	if (value === null) return "null";
	return Array.isArray(value) ? "array" : typeof value;
}

export function fieldError(path: string, message: string) {
	return new StartupError(`Invalid config: ${path}: ${message}`);
}

function object(value: unknown, path: string): Fields {
	if (isObject(value)) return value;
	throw fieldError(path, `expected an object, got ${describe(value)}`);
}

function array(value: unknown, path: string): unknown[] {
	if (Array.isArray(value)) return value;
	throw fieldError(path, `expected an array, got ${describe(value)}`);
}

function string(value: unknown, path: string): string {
	if (typeof value === "string") return value;
	throw fieldError(path, `expected a string, got ${describe(value)}`);
}

function boolean(value: unknown, path: string): boolean {
	if (typeof value === "boolean") return value;
	throw fieldError(path, `expected true or false, got ${describe(value)}`);
}

function stringArray(value: unknown, path: string): string[] {
	return array(value, path).map((item, index) =>
		string(item, `${path}[${index}]`),
	);
}
