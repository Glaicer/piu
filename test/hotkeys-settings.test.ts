import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ManualClock } from "@opentui/core/testing";
import {
	inputArea,
	modalBounds,
	modalTitle,
	openSettings,
	type Piu,
	prepareFixture,
	startPiu,
} from "./harness.ts";
import { spawnPiu } from "./process.ts";

const none = { replies: [] };
const extensions = join(import.meta.dir, "fixtures/hotkeys-extensions");

function readConfig(piu: Piu) {
	return JSON.parse(readFileSync(join(piu.dir, "config.json"), "utf8"));
}

async function openHotkeys(piu: Piu) {
	await openSettings(piu);
	piu.mockInput.pressKey("\x1b[6;5~");
	return piu.waitForFrame(
		(frame) =>
			frame.includes("Focus the next Panel") && frame.includes("Hotkeys"),
	);
}

async function clickRow(piu: Piu, text: string) {
	for (let attempt = 0; attempt < 40; attempt++) {
		const bounds = modalBounds(piu);
		if (!bounds) throw new Error("no Modal");
		const frame = await piu
			.waitForFrame(
				(current) => current.split("\n").some((line) => line.includes(text)),
				250,
			)
			.catch(() => undefined);
		if (frame) {
			const rows = frame.split("\n");
			const y = rows.findLastIndex((row) => row.includes(text));
			const x = rows[y]?.indexOf(text) ?? -1;
			if (y >= bounds.top && y < bounds.top + bounds.height && x >= 0) {
				await piu.mockMouse.click(x, y);
				return;
			}
		}
		await piu.mockMouse.scroll(
			bounds.left + 5,
			bounds.top + bounds.height - 5,
			"down",
		);
		await piu.waitForFrame(() => true);
	}
	throw new Error(`row not found: ${text}`);
}

async function recorded(piu: Piu, clock: ManualClock) {
	clock.advance(1000);
	await piu.renderOnce();
}

test("the Hotkeys tab groups actions by source and marks changed shortcuts", async () => {
	await using piu = await startPiu({
		script: none,
		clock: new ManualClock(),
		config: { keybindings: { "command.model": "alt+n" } },
	});
	const frame = await openHotkeys(piu);
	const lines = frame.split("\n");
	const nextAt = lines.findIndex((line) =>
		line.includes("Focus the next Panel"),
	);
	expect(nextAt).toBeGreaterThan(0);
	expect(lines[nextAt - 1]).toContain("piu");
	expect(lines[nextAt]).toMatch(/Focus the next Panel\s+\[?tab\]?(\s|$)/);
	expect(frame).toContain("⇧⏎ fixed");
	await clickRow(piu, "Switch the model");
	const selected = await piu.waitForFrame(
		(frame) => frame.includes("[alt+n]") && frame.includes("changed"),
	);
	expect(selected).toContain("Switch the model");
	expect(selected).toContain("changed");
});

test("a personal key equal to the default is not marked changed", async () => {
	await using piu = await startPiu({
		script: none,
		config: { keybindings: { "command.model": "ctrl+l" } },
	});
	await openHotkeys(piu);
	await clickRow(piu, "Switch the model");
	const selected = await piu.waitForFrame((current) =>
		current.split("\n").some((line) => line.includes("[ctrl+l]")),
	);
	const line = selected
		.split("\n")
		.find((text) => text.includes("Switch the model"));
	expect(line).not.toContain("changed");
});

test("a conflict warning stays visible for an action below the fold", async () => {
	const clock = new ManualClock();
	await using piu = await startPiu({ script: none, clock, height: 24 });
	await openHotkeys(piu);
	piu.mockInput.pressKey("END");
	await piu.waitForFrame(
		(frame) =>
			frame.includes("Show context window usage") &&
			!frame.includes("Focus the next Panel"),
	);
	piu.mockInput.pressEnter();
	piu.mockInput.pressKey("t", { meta: true });
	await recorded(piu, clock);
	const frame = await piu.waitForFrame(
		(current) =>
			current.includes("Assign alt+t") &&
			!current.includes("Focus the next Panel"),
	);
	expect(frame.replace(/\s+/g, " ")).toContain("Set the reasoning level");
});

test("adding a sequence applies at once and writes the personal Config", async () => {
	await using piu = await startPiu({
		script: none,
		clock: new ManualClock(),
		height: 34,
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await openHotkeys(piu);
	await clickRow(piu, "Switch the model");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((frame) => frame.includes("press a shortcut"));
	piu.mockInput.pressKey("x", { ctrl: true });
	piu.mockInput.pressKey("m");
	await piu.waitForFrame(
		(frame) => frame.includes("[ctrl+x m]") && frame.includes("changed"),
	);
	expect(readConfig(piu).keybindings["command.model"]).toEqual([
		"ctrl+l",
		"ctrl+x m",
	]);
	piu.mockInput.pressEscape();
	await piu.waitForFrame(() => !modalBounds(piu));
	piu.mockInput.pressKey("x", { ctrl: true });
	piu.mockInput.pressKey("m");
	await piu.waitForFrame((frame) => frame.includes("faux-2"));
});

test("a single shortcut is recorded after the pause and runs", async () => {
	const clock = new ManualClock();
	await using piu = await startPiu({ script: none, clock, height: 34 });
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await openHotkeys(piu);
	await clickRow(piu, "Set the reasoning level");
	piu.mockInput.pressEnter();
	piu.mockInput.pressKey("y", { meta: true });
	await recorded(piu, clock);
	await piu.waitForFrame((frame) => frame.includes("[alt+y]"));
	expect(readConfig(piu).keybindings["command.reasoning"]).toEqual([
		"alt+t",
		"alt+y",
	]);
	piu.mockInput.pressEscape();
	await piu.waitForFrame(() => !modalBounds(piu));
	piu.mockInput.pressKey("y", { meta: true });
	await piu.waitForFrame((frame) =>
		frame.split("\n").some((text) => /^\s+off\s+$/.test(text)),
	);
});

test("a newline shortcut added in the tab reaches the prompt without Restart", async () => {
	const clock = new ManualClock();
	await using piu = await startPiu({
		script: { replies: ["Model got {lastUser}"] },
		clock,
		height: 34,
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await openHotkeys(piu);
	await clickRow(piu, "Insert a newline");
	piu.mockInput.pressEnter();
	piu.mockInput.pressKey("x", { ctrl: true });
	piu.mockInput.pressKey("n");
	await piu.waitForFrame((frame) => frame.includes("[ctrl+x n]"));
	expect(readConfig(piu).keybindings["input.newline"]).toEqual([
		"ctrl+j",
		"ctrl+x n",
	]);
	piu.mockInput.pressEscape();
	await piu.waitForFrame(() => !modalBounds(piu));
	await piu.mockInput.typeText("one");
	piu.mockInput.pressKey("x", { ctrl: true });
	piu.mockInput.pressKey("n");
	await piu.mockInput.typeText("two");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((frame) => frame.includes('Model got "one\\ntwo"'));
});

test("the saved keybinding resolves as personal Config on the next start", async () => {
	const clock = new ManualClock();
	await using first = await startPiu({ script: none, clock, height: 34 });
	await openHotkeys(first);
	await clickRow(first, "Switch the model");
	first.mockInput.pressEnter();
	first.mockInput.pressKey("y", { meta: true });
	await recorded(first, clock);
	await first.waitForFrame((frame) => frame.includes("[alt+y]"));
	const { backend: _backend, ...saved } = readConfig(first);

	await using second = await startPiu({
		script: none,
		height: 34,
		config: saved,
	});
	await openHotkeys(second);
	await clickRow(second, "Switch the model");
	await second.waitForFrame((frame) =>
		frame
			.split("\n")
			.some(
				(line) =>
					line.includes("Switch the model") &&
					line.includes("alt+y") &&
					line.includes("changed"),
			),
	);
});

test("a new assignment wins even when its action had an earlier personal key", async () => {
	const clock = new ManualClock();
	await using piu = await startPiu({
		script: none,
		clock,
		height: 34,
		config: {
			keybindings: {
				"command.model": "ctrl+l",
				"command.reasoning": "alt+t",
			},
		},
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await openHotkeys(piu);
	await clickRow(piu, "Switch the model");
	piu.mockInput.pressEnter();
	piu.mockInput.pressKey("t", { meta: true });
	await recorded(piu, clock);
	await piu.waitForFrame((frame) => frame.includes("Assign alt+t"));
	piu.mockInput.pressEnter();
	await piu.waitForFrame((frame) => frame.includes("[alt+t]"));
	const saved = readConfig(piu);
	expect(Object.keys(saved.keybindings)).toEqual([
		"command.reasoning",
		"command.model",
	]);
	piu.mockInput.pressEscape();
	await piu.waitForFrame(() => !modalBounds(piu));
	piu.mockInput.pressKey("t", { meta: true });
	await piu.waitForFrame((frame) => frame.includes("faux-2"));
});

test("an occupied shortcut warns, refuses cleanly, then wins on confirmation", async () => {
	const clock = new ManualClock();
	await using piu = await startPiu({ script: none, clock, height: 34 });
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await openHotkeys(piu);
	await clickRow(piu, "Switch the model");
	piu.mockInput.pressEnter();
	piu.mockInput.pressKey("t", { meta: true });
	await recorded(piu, clock);
	await piu.waitForFrame(
		(frame) =>
			frame.includes('Assign alt+t to "Switch the model"') &&
			frame.includes("Set the reasoning level"),
	);
	expect(readConfig(piu).keybindings).toBeUndefined();

	piu.mockInput.pressEscape();
	await piu.waitForFrame(
		(frame) =>
			modalBounds(piu) !== undefined &&
			!frame.includes("Assign alt+t") &&
			frame.includes("Focus the next Panel"),
	);
	expect(readConfig(piu).keybindings).toBeUndefined();

	await clickRow(piu, "Switch the model");
	piu.mockInput.pressEnter();
	piu.mockInput.pressKey("t", { meta: true });
	await recorded(piu, clock);
	await piu.waitForFrame((frame) => frame.includes("Assign alt+t"));
	piu.mockInput.pressEnter();
	await piu.waitForFrame(
		(frame) =>
			frame.includes("[alt+t]") &&
			frame.includes("changed") &&
			!frame.includes("Assign alt+t"),
	);
	expect(readConfig(piu).keybindings["command.model"]).toEqual([
		"ctrl+l",
		"alt+t",
	]);
	await clickRow(piu, "Set the reasoning level");
	await piu.waitForFrame(
		(frame) =>
			frame.includes("→ Switch the model") && !frame.includes("Assign alt+t"),
	);

	piu.mockInput.pressEscape();
	await piu.waitForFrame(() => !modalBounds(piu));
	piu.mockInput.pressKey("t", { meta: true });
	await piu.waitForFrame((frame) => frame.includes("faux-2"));
});

test("a loaded Extension action is grouped and reassigned from the tab", async () => {
	const clock = new ManualClock();
	await using piu = await startPiu({
		script: none,
		clock,
		extensions,
		height: 34,
		config: { placement: { side: ["hotkeys-a.badge"] } },
	});
	await piu.waitForFrame((frame) => frame.includes("A action: 0"));
	await openHotkeys(piu);
	await clickRow(piu, "Cycle the A counter");
	const found = await piu.waitForFrame((frame) => frame.includes("hotkeys-a"));
	expect(found).toContain("Cycle the A counter");
	piu.mockInput.pressEnter();
	piu.mockInput.pressKey("y", { meta: true });
	await recorded(piu, clock);
	await piu.waitForFrame((frame) => frame.includes("[alt+y]"));
	expect(readConfig(piu).keybindings["hotkeys-a.cycle"]).toEqual([
		"alt+m",
		"alt+y",
	]);
	piu.mockInput.pressEscape();
	await piu.waitForFrame(() => !modalBounds(piu));
	piu.mockInput.pressKey("y", { meta: true });
	await piu.waitForFrame((frame) => frame.includes("A action: 1"));
	piu.mockInput.pressKey("m", { meta: true });
	await piu.waitForFrame((frame) => frame.includes("A action: 2"));
});

test("removing one, clearing all and resetting change only the personal key", async () => {
	const clock = new ManualClock();
	await using piu = await startPiu({
		script: none,
		clock,
		height: 34,
		config: {
			keybindings: {
				"command.model": ["ctrl+l", "ctrl+x m"],
				"command.reasoning": "alt+n",
			},
			theme: { accent: "#123456" },
		},
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await openHotkeys(piu);
	await clickRow(piu, "Switch the model");
	await piu.waitForFrame((frame) => frame.includes("[ctrl+l]"));
	await piu.mockInput.pressKey("ARROW_RIGHT");
	await piu.waitForFrame((frame) => frame.includes("[ctrl+x m]"));
	piu.mockInput.pressBackspace();
	await piu.waitForFrame(
		(frame) => frame.includes("[ctrl+l]") && !frame.includes("ctrl+x m"),
	);
	let saved = readConfig(piu);
	expect(saved.keybindings["command.model"]).toBe("ctrl+l");
	expect(saved.keybindings["command.reasoning"]).toBe("alt+n");
	expect(saved.theme.accent).toBe("#123456");

	piu.mockInput.pressKey("c");
	await piu.waitForFrame((frame) =>
		frame
			.split("\n")
			.some(
				(line) =>
					line.includes("Switch the model") &&
					line.includes("changed") &&
					!line.includes("ctrl+l"),
			),
	);
	saved = readConfig(piu);
	expect(saved.keybindings["command.model"]).toEqual([]);
	expect(saved.keybindings["command.reasoning"]).toBe("alt+n");

	piu.mockInput.pressKey("r");
	await piu.waitForFrame((frame) =>
		frame
			.split("\n")
			.some(
				(line) =>
					line.includes("Switch the model") &&
					line.includes("[ctrl+l]") &&
					!line.includes("changed"),
			),
	);
	saved = readConfig(piu);
	expect("command.model" in saved.keybindings).toBe(false);
	expect(saved.keybindings["command.reasoning"]).toBe("alt+n");

	piu.mockInput.pressEscape();
	await piu.waitForFrame(() => !modalBounds(piu));
	piu.mockInput.pressKey("l", { ctrl: true });
	await piu.waitForFrame((frame) => frame.includes("faux-2"));
});

test("Shift+Enter cannot be assigned to another action and the Config stays untouched", async () => {
	const clock = new ManualClock();
	await using piu = await startPiu({ script: none, clock, height: 34 });
	await openHotkeys(piu);
	await clickRow(piu, "Switch the model");
	piu.mockInput.pressEnter();
	piu.mockInput.pressEnter({ shift: true });
	await piu.waitForFrame((frame) => frame.includes("Shift+Enter"));
	expect(readConfig(piu).keybindings).toBeUndefined();
	const fixed = await piu.waitForFrame((frame) => frame.includes("⇧⏎ fixed"));
	expect(fixed).toContain("⇧⏎ fixed");
});

test("recording swallows keys: no action runs, no tab switch, no input text", async () => {
	const clock = new ManualClock();
	await using piu = await startPiu({
		script: none,
		clock,
		height: 34,
		config: { keybindings: { "command.settings": "alt+s" } },
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await piu.mockInput.typeText("keep");
	await piu.waitForFrame((frame) => inputArea(frame).includes("keep"));
	piu.mockInput.pressKey("s", { meta: true });
	await piu.waitForFrame(
		(frame) => frame.includes("Global") && frame.includes("Animations"),
	);
	piu.mockInput.pressKey("\x1b[6;5~");
	await piu.waitForFrame((frame) => frame.includes("Focus the next Panel"));
	await clickRow(piu, "Switch the model");
	piu.mockInput.pressEnter();
	piu.mockInput.pressKey("\x1b[6;5~");
	const frame = await piu.waitForFrame((current) =>
		current.includes("press a second key"),
	);
	expect(frame).not.toContain("Animations");
	expect(frame).not.toContain(modalTitle("Reasoning"));
	piu.mockInput.pressEscape();
	await piu.waitForFrame(
		(current) =>
			modalBounds(piu) !== undefined && !current.includes("press a second key"),
	);

	piu.mockInput.pressEnter();
	piu.mockInput.pressKey("t", { meta: true });
	const alert = await piu.waitForFrame((current) =>
		current.includes("press a second key"),
	);
	expect(alert).not.toContain(modalTitle("Reasoning"));
	clock.advance(1000);
	await piu.renderOnce();
	await piu.waitForFrame((current) => current.includes("Assign alt+t"));
	expect(readConfig(piu).keybindings["command.model"]).toBeUndefined();
	piu.mockInput.pressEscape();
	await piu.waitForFrame(
		(current) =>
			!current.includes("Assign alt+t") && modalBounds(piu) !== undefined,
	);
	piu.mockInput.pressEscape();
	const closed = await piu.waitForFrame(() => !modalBounds(piu));
	expect(inputArea(closed).trim()).toBe("keep");
});

test("the launcher reloads a Hotkeys assignment on Restart", async () => {
	const fixture = prepareFixture({
		script: { replies: ["Model got {lastUser}"] },
		config: {},
	});
	try {
		await using piu = spawnPiu(fixture, { env: { PI_OFFLINE: "1" } });
		await piu.waitForText("faux-1");
		piu.submit("/settings");
		await piu.waitForText("Animations");
		piu.type("\x1b[6;5~");
		await piu.waitForText("Focus the next Panel");
		piu.type("\x1b[B\x1b[B");
		piu.type("\r");
		await piu.waitForText("press a shortcut");
		piu.type("\x18n");
		await piu.waitForText("ctrl+x n");
		piu.type("\x1b[27u");
		const beforeRestart = piu.mark();
		piu.submit("/restart");
		await piu.waitForStarts(2);
		await piu.waitForText("faux-1", beforeRestart);
		const reopened = piu.mark();
		piu.type("one");
		piu.type("\x18n");
		piu.type("two\r");
		await piu.waitForText('Model got "one\\ntwo"', reopened);
	} finally {
		fixture.removeDir();
	}
}, 30000);

test("the action list scrolls to the last action and back", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		height: 24,
		config: { placement: { side: ["hotkeys-a.badge"] } },
	});
	await openHotkeys(piu);
	const first = await piu.waitForFrame((frame) =>
		frame.includes("Focus the next Panel"),
	);
	expect(first).not.toContain("Throw from the handler");
	piu.mockInput.pressKey("END");
	await piu.waitForFrame(
		(frame) =>
			frame.includes("Throw from the handler") &&
			!frame.includes("Focus the next Panel"),
	);
	piu.mockInput.pressKey("HOME");
	await piu.waitForFrame(
		(frame) =>
			frame.includes("Focus the next Panel") &&
			!frame.includes("Throw from the handler"),
	);
});
