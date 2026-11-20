import { existsSync, readFileSync } from "node:fs";
import type { BackendConfig } from "./backend.ts";
import { readJson, writeJson } from "./json-file.ts";
import {
	type Chord,
	editKeybinding,
	isKeyName,
	type Keybindings,
	parseChord,
	type Shortcut,
	sameShortcut,
	shiftEnter,
	shortcutSpec,
} from "./keybindings.ts";
import type { Size, Slot } from "./layout.tsx";
import type { ModuleSettings } from "./module.ts";
import { StartupError } from "./startup-error.ts";
import {
	isThemeToken,
	type ThemeConfig,
	type ThemePreference,
	themeModes,
	themeTokens,
} from "./theme.ts";

export type Placement = Readonly<Record<string, readonly string[]>>;

export type Config = {
	backend: BackendConfig;
	layout: Slot;
	placement: Placement;
	modules: Readonly<Record<string, ModuleSettings>>;
	keybindings: Keybindings;
	theme: ThemeConfig;
	animations: boolean;
};

export const defaultConfig: Omit<Config, "keybindings"> & {
	keybindings: Readonly<Record<string, string>>;
} = {
	backend: { command: "pi", args: [] },
	layout: {
		kind: "container",
		id: "root",
		direction: "column",
		size: "rest",
		children: [
			{
				kind: "container",
				id: "body",
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
								kind: "panel",
								id: "pinned",
								direction: "column",
								size: "content",
							},
							{
								kind: "container",
								id: "input-area",
								direction: "column",
								size: "content",
								joinAbove: true,
								children: [
									{
										kind: "panel",
										id: "status",
										direction: "row",
										size: "content",
									},
									{
										kind: "panel",
										id: "input",
										direction: "column",
										size: "content",
										title: "",
									},
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
			{
				kind: "panel",
				id: "bottom",
				direction: "row",
				size: "content",
				bar: true,
			},
		],
	},
	placement: {
		agent: ["chat.messages"],
		pinned: ["background.processes"],
		input: [
			"ask-user-question.card",
			"btw.side",
			"context.host",
			"input.prompt",
		],
		status: ["status.line", "modes.bridge"],
		side: [],
		bottom: ["model.current", "input.dir", "status.working"],
	},
	modules: {},
	theme: { mode: "auto" },
	animations: true,
	keybindings: {
		"focus.next": "tab",
		"focus.previous": "shift+tab",
		"input.newline": "ctrl+j",
		"chat.top": "ctrl+home",
		"chat.bottom": "ctrl+end",
		"input.external-editor": "ctrl+g",
		"input.paste": "ctrl+v",
		"input.dequeue": "alt+up",
		"app.suspend": "ctrl+z",
		"model.next": "ctrl+p",
		"model.previous": "ctrl+shift+p",
		"reasoning.cycle": "alt+shift+t",
		"chat.toggle-tools": "ctrl+o",
		"chat.toggle-thinking": "ctrl+t",
		"chat.copy": "ctrl+x",
		"command.model": "ctrl+l",
		"command.reasoning": "alt+t",
	},
};

type Fields = Record<string, unknown>;

const topLevelKeys = [
	"backend",
	"layout",
	"placement",
	"modules",
	"keybindings",
	"theme",
	"animations",
];

function onlyKeys(fields: Fields, allowed: readonly string[], parent: string) {
	for (const key of Object.keys(fields)) {
		if (!allowed.includes(key)) {
			throw fieldError(
				parent ? `${parent}.${key}` : key,
				`unknown key, expected one of: ${allowed.join(", ")}`,
			);
		}
	}
}

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
		keybindings:
			user.keybindings === undefined ? {} : parseKeybindings(user.keybindings),
		theme: parseTheme(mergeObjects(defaultConfig.theme, user.theme)),
		animations: boolean(
			user.animations ?? defaultConfig.animations,
			"animations",
		),
	};
}

export type GlobalSettingChange =
	| { key: "theme.mode"; value: ThemePreference }
	| { key: "animations"; value: boolean };

export function saveGlobalSetting(path: string, change: GlobalSettingChange) {
	const { value, error } = readJson(path);
	if (error) throw new Error(error);
	const config = value === undefined ? {} : object(value, "config");
	if (change.key === "theme.mode") {
		const theme = "theme" in config ? object(config.theme, "theme") : {};
		writeJson(path, { ...config, theme: { ...theme, mode: change.value } }, 2);
	} else {
		writeJson(path, { ...config, animations: change.value }, 2);
	}
}

function readKeybindingConfig(path: string) {
	const { value, error } = readJson(path);
	if (error) throw new Error(error);
	const config = value === undefined ? {} : object(value, "config");
	const bindings =
		"keybindings" in config ? object(config.keybindings, "keybindings") : {};
	return { config, bindings };
}

export function readKeybindingEdit(path: string) {
	const snapshot = readKeybindingConfig(path);
	return {
		personal: parseKeybindings(snapshot.bindings),
		save(action: string, shortcuts: readonly Shortcut[], moveToEnd: boolean) {
			writeKeybinding(path, snapshot, action, shortcuts, moveToEnd);
		},
	};
}

export function saveKeybinding(
	path: string,
	action: string,
	shortcuts: readonly Shortcut[] | undefined,
	moveToEnd = false,
) {
	writeKeybinding(
		path,
		readKeybindingConfig(path),
		action,
		shortcuts,
		moveToEnd,
	);
}

function writeKeybinding(
	path: string,
	{ config, bindings }: ReturnType<typeof readKeybindingConfig>,
	action: string,
	shortcuts: readonly Shortcut[] | undefined,
	moveToEnd: boolean,
) {
	const keybindings = editKeybinding<unknown>(
		bindings,
		action,
		shortcuts === undefined ? undefined : bindingValue(shortcuts),
		moveToEnd,
	);
	writeJson(path, { ...config, keybindings }, 2);
}

function bindingValue(shortcuts: readonly Shortcut[]) {
	const specs = shortcuts.map(shortcutSpec);
	if (specs.length === 0) return [];
	return specs.length === 1 ? specs[0] : specs;
}

function readUserConfig(path: string): Fields {
	if (!existsSync(path)) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		throw new StartupError(`${path}: ${(error as Error).message}`);
	}
	const fields = object(parsed, "config");
	onlyKeys(fields, topLevelKeys, "");
	return fields;
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
	onlyKeys(fields, ["command", "args"], "backend");
	return {
		command: string(fields.command, "backend.command"),
		args: stringArray(fields.args, "backend.args"),
	};
}

const slotKeys = [
	"kind",
	"id",
	"direction",
	"size",
	"minSize",
	"hideBelow",
	"title",
	"joinAbove",
];

function parseSlot(value: unknown, path: string, panelIds: Set<string>): Slot {
	const fields = object(value, path);
	const kind = fields.kind;
	if (kind !== "container" && kind !== "panel") {
		throw fieldError(
			`${path}.kind`,
			`expected "container" or "panel", got ${JSON.stringify(kind)}`,
		);
	}
	onlyKeys(
		fields,
		[...slotKeys, ...(kind === "container" ? ["children"] : ["bar"])],
		path,
	);
	const base = {
		id: string(fields.id, `${path}.id`),
		direction: direction(fields.direction, `${path}.direction`),
		size: parseSize(fields.size, `${path}.size`),
		...optionalCells(fields, "minSize", path),
		...optionalCells(fields, "hideBelow", path),
		...(fields.joinAbove === undefined
			? {}
			: { joinAbove: boolean(fields.joinAbove, `${path}.joinAbove`) }),
		...(fields.title === undefined
			? {}
			: { title: string(fields.title, `${path}.title`) }),
	};
	if (kind === "panel") {
		if (panelIds.has(base.id)) {
			throw fieldError(`${path}.id`, `Panel id "${base.id}" is already used`);
		}
		panelIds.add(base.id);
		return {
			kind,
			...base,
			...(fields.bar === undefined
				? {}
				: { bar: boolean(fields.bar, `${path}.bar`) }),
		};
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
	const placement = Object.fromEntries(
		Object.entries(fields).map(([panelId, moduleIds]) => {
			const path = `placement.${panelId}`;
			if (!panelIds.has(panelId)) {
				throw fieldError(path, "no Panel with this id in the Layout");
			}
			return [panelId, stringArray(moduleIds, path)];
		}),
	);
	if (Object.values(placement).every((moduleIds) => moduleIds.length === 0)) {
		throw fieldError(
			"placement",
			"no Module is placed, so the frame would be empty; place Modules in the Layout's Panels",
		);
	}
	return placement;
}

function parseModules(value: unknown) {
	return Object.fromEntries(
		Object.entries(object(value, "modules")).map(([id, settings]) => [
			id,
			object(settings, `modules[${JSON.stringify(id)}]`),
		]),
	);
}

export function parseBindingValue(
	value: unknown,
	action: string,
	path = `keybindings.${action}`,
): readonly Shortcut[] {
	if (Array.isArray(value)) {
		const parsed: Shortcut[] = [];
		for (let at = 0; at < value.length; at++) {
			const spec = value[at];
			if (typeof spec !== "string") {
				throw fieldError(path, `expected a string, got ${describe(spec)}`);
			}
			parsed.push(parseShortcut(spec, action, path));
		}
		return parsed;
	}
	if (typeof value !== "string") {
		throw fieldError(
			path,
			`expected a key like "ctrl+j" or an array of them, got ${describe(value)}`,
		);
	}
	return [parseShortcut(value, action, path)];
}

function parseShortcut(spec: string, action: string, path: string): Shortcut {
	const trimmed = spec.trim();
	if (!trimmed) {
		throw fieldError(path, "expected a key, got an empty string");
	}
	const parts = trimmed.split(/ +/);
	if (parts.length > 2) {
		throw fieldError(
			path,
			`expected at most two strokes separated by a space, got ${parts.length}`,
		);
	}
	return validateChords(
		parts.map((part) => parseStroke(part, path)),
		action,
		path,
	);
}

export function validateShortcut(
	shortcut: Shortcut,
	action: string,
	path = `keybindings.${action}`,
): Shortcut {
	return validateChords(shortcut, action, path);
}

function validateChords(
	chords: readonly Chord[],
	action: string,
	path: string,
): Shortcut {
	for (const [at, chord] of chords.entries()) {
		if (chord.name === "c" && chord.ctrl && !chord.shift && !chord.meta) {
			throw fieldError(
				path,
				"Ctrl+C is the emergency exit and cannot be bound",
			);
		}
		if (
			at > 0 &&
			chord.name === "escape" &&
			!chord.ctrl &&
			!chord.shift &&
			!chord.meta
		) {
			throw fieldError(
				path,
				"An unmodified Esc cancels a waiting sequence and cannot finish one",
			);
		}
		if (!sameShortcut([chord], [shiftEnter])) continue;
		if (action !== "input.newline") {
			throw fieldError(
				path,
				"Shift+Enter is the newline key and can only be bound to input.newline",
			);
		}
		if (at === 0 && chords.length > 1) {
			throw fieldError(path, "Shift+Enter cannot start a sequence");
		}
	}
	const [first, second] = chords;
	if (first === undefined) {
		throw fieldError(path, "expected a key, got an empty string");
	}
	return second === undefined ? [first] : [first, second];
}

function parseStroke(spec: string, path: string): Chord {
	const chord = parseChord(spec);
	if (!chord) {
		throw fieldError(
			path,
			`expected a key like "ctrl+j" or "shift+tab", got ${JSON.stringify(spec)}`,
		);
	}
	if (!isKeyName(chord.name)) {
		throw fieldError(
			path,
			`OpenTUI never reports a key named ${JSON.stringify(chord.name)} (it says "escape" and "return", for example)`,
		);
	}
	return chord;
}

export function parseKeybindings(value: unknown): Keybindings {
	return Object.fromEntries(
		Object.entries(object(value, "keybindings")).map(([action, spec]) => [
			action,
			parseBindingValue(spec, action),
		]),
	);
}

function parseTheme(value: unknown): ThemeConfig {
	const { mode, ...overrides } = object(value, "theme");
	const preference = themeModes.find((choice) => choice === mode);
	if (!preference)
		throw fieldError("theme.mode", `expected one of ${themeModes.join(", ")}`);
	return {
		...Object.fromEntries(
			Object.entries(overrides).map(([name, color]) => {
				const path = `theme.${name}`;
				if (!isThemeToken(name)) {
					throw fieldError(path, `expected one of ${themeTokens.join(", ")}`);
				}
				const hex = string(color, path);
				if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
					throw fieldError(
						path,
						`expected a color like "#7aa2f7", got ${JSON.stringify(hex)}`,
					);
				}
				return [name, hex];
			}),
		),
		mode: preference,
	};
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
