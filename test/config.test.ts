import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { startPiu } from "./harness.ts";
import { loaded } from "./loaded.ts";

const extensionsDir = join(import.meta.dir, "fixtures/extensions");
const clashDir = join(import.meta.dir, "fixtures/extensions-clash");
const wrapper = join(import.meta.dir, "fixtures/backend-wrapper.sh");
const none = { replies: [] };

function lineOf(frame: string, text: string) {
	return frame.split("\n").findIndex((line) => line.includes(text));
}

test("a config that reorders one Panel changes the order without copying the Layout", async () => {
	await using piu = await startPiu({
		script: none,
		extensionsDir,
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

	const frame = await piu.waitForFrame((f) => f.includes("Solo reply"));
	expect(frame.split("\n")[0]).not.toContain("┐┌");
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
		"a settings entry that is not an object",
		{ modules: { "chat.messages": 3 } },
		'modules["chat.messages"]',
	],
])(
	"%s stops startup with an error naming the field path",
	async (_name, config, path) => {
		await expect(
			startPiu({ script: none, extensionsDir, config }),
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
		extensionsDir,
		config: {
			placement: { side: ["greeter.hello"] },
			modules: { "greeter.hello": { name: "Ada" } },
		},
	});

	await piu.waitForFrame((f) => f.includes("Hello Ada"));
	expect(loaded).not.toContain("lazy");
});

test("an Extension without a Modules list stops startup naming the Extension", async () => {
	await expect(
		startPiu({
			script: none,
			extensionsDir,
			config: { placement: { side: ["broken.anything"] } },
		}),
	).rejects.toThrow('Extension "broken"');
});

test("the same Extension name in builtin/ and extensions/ fails startup naming both paths", async () => {
	const error = await startPiu({ script: none, extensionsDir: clashDir }).then(
		() => undefined,
		(e: Error) => e,
	);

	expect(error?.message).toContain(join(clashDir, "chat"));
	expect(error?.message).toContain(join(import.meta.dir, "../builtin/chat"));
});
