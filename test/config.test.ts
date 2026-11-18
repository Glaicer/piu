import { expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseBindingValue, saveKeybinding } from "../src/config.ts";
import { panelBoxes, startPiu } from "./harness.ts";
import { hooks } from "./hooks.ts";

const extensions = join(import.meta.dir, "fixtures/extensions");
const clashDir = join(import.meta.dir, "fixtures/extensions-clash");
const dupCommandDir = join(import.meta.dir, "fixtures/extensions-dup-command");
const dotDir = join(import.meta.dir, "fixtures/extensions-dot");
const wrapper = join(import.meta.dir, "fixtures/backend-wrapper.sh");
const none = { replies: [] };

function lineOf(frame: string, text: string) {
	return frame.split("\n").findIndex((line) => line.includes(text));
}

test("a config that reorders one Panel changes the order without copying the Layout", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		config: { placement: { side: ["greeter.bye", "greeter.hello"] } },
	});

	const frame = await piu.waitForFrame((f) => f.includes("Bye"));
	expect(lineOf(frame, "Bye")).toBeLessThan(lineOf(frame, "Hello"));
});

test("a config that replaces layout replaces the whole tree", async () => {
	await using piu = await startPiu({
		script: { replies: ["Solo reply"] },
		config: {
			layout: { kind: "panel", id: "solo", direction: "column", size: "rest" },
			placement: { solo: ["chat.messages", "input.prompt"] },
		},
	});

	await piu.mockInput.typeText("Anyone?");
	piu.mockInput.pressEnter();

	await piu.waitForFrame((f) => f.includes("Solo reply"));
	expect(panelBoxes(piu).map((box) => box.id)).toEqual(["solo"]);
});

test("backend.command in the config decides which program is started", async () => {
	await using piu = await startPiu({
		script: { replies: ["Wrapped reply"] },
		config: { backend: { command: wrapper } },
	});

	await piu.mockInput.typeText("Hi");
	piu.mockInput.pressEnter();

	await piu.waitForFrame((f) => f.includes("Wrapped reply"));
	expect(existsSync(join(piu.dir, "wrapper-ran"))).toBe(true);
});

test.each([
	["a wrong type", { backend: { command: 5 } }, "backend.command"],
	[
		"an animations switch that is not a boolean",
		{ animations: "yes" },
		"animations",
	],
	[
		"a malformed size",
		{ layout: { kind: "panel", id: "p", direction: "column", size: "wide" } },
		"layout.size",
	],
	[
		"a zero percentage",
		{ layout: { kind: "panel", id: "p", direction: "column", size: "0%" } },
		"layout.size",
	],
	[
		"a percentage over 100",
		{ layout: { kind: "panel", id: "p", direction: "column", size: "101%" } },
		"layout.size",
	],
	[
		"a minSize that is not a positive cell count",
		{
			layout: {
				kind: "panel",
				id: "p",
				direction: "column",
				size: "rest",
				minSize: "10%",
			},
		},
		"layout.minSize",
	],
	[
		"a hideBelow that is not a positive column count",
		{
			layout: {
				kind: "panel",
				id: "p",
				direction: "column",
				size: "rest",
				hideBelow: 0,
			},
		},
		"layout.hideBelow",
	],
	[
		"a Panel id used twice",
		{
			layout: {
				kind: "container",
				id: "root",
				direction: "row",
				size: "rest",
				children: [
					{ kind: "panel", id: "twin", direction: "column", size: "rest" },
					{ kind: "panel", id: "twin", direction: "column", size: "rest" },
				],
			},
		},
		"layout.children[1].id",
	],
	[
		"Modules placed on a Container",
		{ placement: { main: ["chat.messages"] } },
		"placement.main",
	],
	[
		"a layout kind that does not exist",
		{ layout: { kind: "grid", id: "p" } },
		"layout.kind",
	],
	[
		"an unknown Module id",
		{ placement: { agent: ["chat.nope"] } },
		"placement.agent[0]",
	],
	[
		"an unknown Extension",
		{ placement: { agent: ["ghost.messages"] } },
		"placement.agent[0]",
	],
	[
		"an unknown Panel id in Placement",
		{ placement: { elsewhere: ["chat.messages"] } },
		"placement.elsewhere",
	],
	[
		"settings for a Module that is not placed",
		{ modules: { "greeter.hello": { name: "x" } } },
		'modules["greeter.hello"]',
	],
	[
		"a keybinding for an action nothing defines",
		{ keybindings: { "focus.sideways": "ctrl+x" } },
		"keybindings.focus.sideways",
	],
	[
		"an empty action name for an unplaced Extension",
		{ keybindings: { "lazy.": "alt+m" } },
		"keybindings.lazy.",
	],
	[
		"a dotted action name for an unplaced Extension",
		{ keybindings: { "lazy.bad.name": "alt+m" } },
		"keybindings.lazy.bad.name",
	],
	[
		"a key that cannot be parsed",
		{ keybindings: { "focus.next": "hyper+tab" } },
		"keybindings.focus.next",
	],
	[
		"a modifier that only exists on Object.prototype",
		{ keybindings: { "focus.next": "constructor+tab" } },
		"keybindings.focus.next",
	],
	[
		"bar on a Container",
		{
			layout: {
				kind: "container",
				id: "root",
				direction: "row",
				size: "rest",
				bar: true,
				children: [
					{ kind: "panel", id: "p", direction: "column", size: "rest" },
				],
			},
		},
		"layout.bar",
	],
	[
		"a bar that is not a boolean",
		{
			layout: {
				kind: "panel",
				id: "p",
				direction: "row",
				size: "content",
				bar: "yes",
			},
		},
		"layout.bar",
	],
	["a misspelled top-level key", { palcement: {} }, "palcement"],
	[
		"a misspelled key inside backend",
		{ backend: { comand: "pi" } },
		"backend.comand",
	],
	[
		"a misspelled key in a Layout Slot",
		{
			layout: {
				kind: "container",
				id: "root",
				direction: "row",
				size: "rest",
				children: [
					{
						kind: "panel",
						id: "p",
						direction: "column",
						size: "rest",
						hidebelow: 80,
					},
				],
			},
		},
		"layout.children[0].hidebelow",
	],
	[
		"children on a Panel",
		{
			layout: {
				kind: "panel",
				id: "p",
				direction: "column",
				size: "rest",
				children: [],
			},
		},
		"layout.children",
	],
	[
		"a layout whose Panels the default Placement does not cover",
		{
			layout: { kind: "panel", id: "solo", direction: "column", size: "rest" },
		},
		"no Module is placed",
	],
	[
		"an empty Placement",
		{
			placement: {
				agent: [],
				pinned: [],
				input: [],
				status: [],
				side: [],
				bottom: [],
			},
		},
		"no Module is placed",
	],
	[
		"a key name OpenTUI never reports (esc)",
		{ keybindings: { "focus.next": "esc" } },
		"keybindings.focus.next",
	],
	[
		"a key name OpenTUI never reports (ctrl+enter)",
		{ keybindings: { "input.newline": "ctrl+enter" } },
		"keybindings.input.newline",
	],
	[
		"an empty shortcut",
		{ keybindings: { "command.model": "" } },
		"keybindings.command.model",
	],
	[
		"a whitespace-only shortcut",
		{ keybindings: { "command.model": "   " } },
		"keybindings.command.model",
	],
	[
		"a three-stroke shortcut",
		{ keybindings: { "command.model": "ctrl+x m t" } },
		"keybindings.command.model",
	],
	[
		"an invalid second stroke",
		{ keybindings: { "command.model": "ctrl+x foobar" } },
		"keybindings.command.model",
	],
	[
		"a non-string list item",
		{ keybindings: { "command.model": ["x", 42] } },
		"keybindings.command.model",
	],
	[
		"Shift+Enter bound to another action",
		{ keybindings: { "command.model": "shift+return" } },
		"keybindings.command.model",
	],
	[
		"Shift+Enter finishing another action",
		{ keybindings: { "command.model": "x shift+return" } },
		"keybindings.command.model",
	],
	[
		"Shift+Enter starting another action",
		{ keybindings: { "command.model": "shift+return x" } },
		"keybindings.command.model",
	],
	[
		"Shift+Enter starting a newline sequence",
		{ keybindings: { "input.newline": "shift+return x" } },
		"keybindings.input.newline",
	],
	[
		"Esc finishing a sequence",
		{ keybindings: { "command.model": "ctrl+x escape" } },
		"keybindings.command.model",
	],
	[
		"Ctrl+C bound to an action",
		{ keybindings: { "command.restart": "ctrl+c" } },
		"keybindings.command.restart",
	],
	[
		"Ctrl+C finishing a sequence",
		{ keybindings: { "command.model": "ctrl+x ctrl+c" } },
		"keybindings.command.model",
	],
	[
		"a settings entry that is not an object",
		{ modules: { "chat.messages": 3 } },
		'modules["chat.messages"]',
	],
])(
	"%s stops startup with an error naming the field path",
	async (_name, config, path) => {
		await expect(
			startPiu({ script: none, extensions, config }),
		).rejects.toThrow(path);
	},
);

test("a config.json whose top level is not an object names the problem", async () => {
	await expect(startPiu({ script: none, config: "[]" })).rejects.toThrow(
		"config: expected an object",
	);
});

test("a config.json that is not valid JSON stops startup with a readable error", async () => {
	await expect(startPiu({ script: none, config: "{ nope" })).rejects.toThrow(
		"config.json",
	);
});

test("an Extension in extensions/ is rendered when placed and not loaded when not placed", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		config: {
			placement: { side: ["greeter.hello"] },
			modules: { "greeter.hello": { name: "Ada" } },
		},
	});

	await piu.waitForFrame((f) => f.includes("Hello Ada"));
	expect(hooks.loaded).not.toContain("lazy");
});

test("an Extension without a Modules list stops startup naming the Extension", async () => {
	await expect(
		startPiu({
			script: none,
			extensions,
			config: { placement: { side: ["broken.anything"] } },
		}),
	).rejects.toThrow('Extension "broken"');
});

test("the same Extension name in builtin/ and extensions/ fails startup naming both paths", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-test-"));
	const error = await startPiu({
		script: none,
		dir,
		extensions: clashDir,
	}).then(
		() => undefined,
		(e: Error) => e,
	);

	rmSync(dir, { recursive: true, force: true });

	expect(error?.message).toContain(join(dir, "extensions/chat"));
	expect(error?.message).toContain(join(import.meta.dir, "../builtin/chat"));
});

test("two enabled Extensions defining the same command name fail startup naming both", async () => {
	const error = await startPiu({
		script: none,
		extensions: dupCommandDir,
		config: { placement: { side: ["first.tag", "second.tag"] } },
	}).then(
		() => undefined,
		(e: Error) => e,
	);

	expect(error?.message).toContain("/twice");
	expect(error?.message).toContain('"first"');
	expect(error?.message).toContain('"second"');
});

test("an Extension folder with a dot in its name fails startup naming its path", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-test-"));
	const error = await startPiu({ script: none, dir, extensions: dotDir }).then(
		() => undefined,
		(e: Error) => e,
	);

	rmSync(dir, { recursive: true, force: true });

	expect(error?.message).toContain(join(dir, "extensions/my.ext"));
});

test("saving one keybinding keeps an own __proto__ key from the file", () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-config-"));
	const path = join(dir, "config.json");
	try {
		// why: an object literal cannot carry an own __proto__, so the file is written as JSON text.
		writeFileSync(
			path,
			'{"keybindings":{"__proto__":"alt+p","command.model":"ctrl+l"}}',
		);
		saveKeybinding(
			path,
			"command.model",
			parseBindingValue("alt+n", "command.model"),
			true,
		);
		const saved = JSON.parse(readFileSync(path, "utf8"));
		expect(Object.hasOwn(saved.keybindings, "__proto__")).toBe(true);
		expect(
			Object.getOwnPropertyDescriptor(saved.keybindings, "__proto__")?.value,
		).toBe("alt+p");
		expect(saved.keybindings["command.model"]).toBe("alt+n");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
