import { expect, test } from "bun:test";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RGBA, TextAttributes } from "@opentui/core";
import { ManualClock } from "@opentui/core/testing";
import {
	focusedPanels,
	modalBounds,
	type Piu,
	prepareFixture,
	startPiu,
} from "./harness.ts";
import { spawnPiu } from "./process.ts";

const script = { replies: [] };

async function openSettings(piu: Piu) {
	await piu.waitForFrame((frame) => frame.includes("/ commands"));
	await piu.mockInput.typeText("/settings");
	await piu.waitForFrame((frame) => frame.includes("  /settings"));
	piu.mockInput.pressEnter();
	return piu.waitForFrame(
		(frame) => frame.includes("Global") && frame.includes("Animations"),
	);
}

async function clickText(piu: Piu, text: string) {
	const rows = piu.captureCharFrame().split("\n");
	const y = rows.findLastIndex((row) => row.includes(text));
	const x = rows[y]?.indexOf(text) ?? -1;
	expect(x).toBeGreaterThanOrEqual(0);
	await piu.mockMouse.click(x, y);
}

function span(piu: Piu, text: string) {
	return piu
		.captureSpans()
		.lines.flatMap((line) => line.spans)
		.find((span) => span.text.trim() === text);
}

test("Settings opens centered and applies a theme without losing other Config keys", async () => {
	await using piu = await startPiu({
		script,
		width: 120,
		height: 32,
		terminalBackground: "dark",
		config: { theme: { accent: "#123456" } },
	});
	await openSettings(piu);
	expect(modalBounds(piu)).toMatchObject({
		left: 15,
		top: 4,
		width: 90,
		height: 24,
	});
	const file = join(piu.dir, "config.json");
	const before = JSON.parse(readFileSync(file, "utf8"));
	const edited = {
		...before,
		animations: true,
		theme: { ...before.theme, muted: "#abcdef" },
	};
	writeFileSync(file, JSON.stringify(edited));
	piu.mockInput.pressEnter();
	await piu.waitForFrame(() => {
		const global = span(piu, "Global");
		return (
			span(piu, "esc")?.bg.equals(RGBA.fromHex("#ffffff")) === true &&
			global?.fg.equals(RGBA.fromHex("#123456")) === true &&
			(global.attributes & TextAttributes.BOLD) !== 0
		);
	});
	const saved = readFileSync(file, "utf8");
	expect(JSON.parse(saved)).toEqual({
		...edited,
		theme: { accent: "#123456", muted: "#abcdef", mode: "light" },
	});
	expect(saved).toContain('\n  "theme": {');
	piu.reportTerminalBackground("light");
	piu.reportTerminalBackground("dark");
	piu.mockInput.pressEscape();
	await piu.waitForFrame(
		() =>
			!modalBounds(piu) &&
			piu.renderer.getCursorState().color.equals(RGBA.fromHex("#e10600")),
	);
	await openSettings(piu);
	piu.mockInput.pressEnter();
	await piu.waitForFrame(
		() => span(piu, "esc")?.bg.equals(RGBA.fromHex("#121212")) === true,
	);
	piu.mockInput.pressEnter();
	await piu.waitForFrame((frame) => /Theme +auto/.test(frame));
	piu.reportTerminalBackground("light");
	await piu.waitForFrame(
		() => span(piu, "esc")?.bg.equals(RGBA.fromHex("#ffffff")) === true,
	);
});

test("Settings is available with only the prompt placed, and resizes and dismisses from outside", async () => {
	await using piu = await startPiu({
		script,
		width: 120,
		height: 32,
		config: {
			placement: {
				agent: [],
				pinned: [],
				input: ["input.prompt"],
				status: [],
				bottom: [],
			},
		},
	});
	await openSettings(piu);
	piu.resize(96, 24);
	await piu.waitForFrame(() => {
		const bounds = modalBounds(piu);
		return (
			bounds?.left === 12 &&
			bounds.top === 3 &&
			bounds.width === 72 &&
			bounds.height === 18
		);
	});
	expect(modalBounds(piu)).toEqual({ left: 12, top: 3, width: 72, height: 18 });
	await piu.mockMouse.click(0, 0);
	const closed = await piu.waitForFrame(() => !modalBounds(piu));
	expect(focusedPanels(piu, closed)).toEqual(["input"]);
	await piu.mockInput.typeText("draft");
	await piu.waitForFrame((frame) => frame.includes("draft"));
});

test("Settings applies a change in memory and reports it when the Config cannot be saved", async () => {
	await using piu = await startPiu({ script, terminalBackground: "dark" });
	await openSettings(piu);
	const file = join(piu.dir, "config.json");
	writeFileSync(file, "{ broken\n");
	await clickText(piu, "Theme");
	await piu.waitForFrame(
		(frame) =>
			/Theme +light/.test(frame) &&
			frame.includes("Could not save Settings") &&
			span(piu, "esc")?.bg.equals(RGBA.fromHex("#ffffff")) === true,
	);
	expect(readFileSync(file, "utf8")).toBe("{ broken\n");
});

test("Settings creates a missing personal Config without copying defaults", async () => {
	await using piu = await startPiu({ script });
	await openSettings(piu);
	const file = join(piu.dir, "config.json");
	unlinkSync(file);
	piu.mockInput.pressEnter();
	await piu.waitForFrame((frame) => /Theme +light/.test(frame));
	expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
		theme: { mode: "light" },
	});
});

const extensionOptions = {
	script,
	extensions: join(import.meta.dir, "fixtures/settings-extensions"),
	config: { placement: { side: ["profile.badge"] } },
	height: 24,
};

test("a loaded personal Extension tab opens by click and its content scrolls under the tab strip", async () => {
	await using piu = await startPiu(extensionOptions);
	const frame = await openSettings(piu);
	expect(frame).toMatch(/Global +Profile/);
	await clickText(piu, "Profile");
	await piu.waitForFrame(
		(frame) =>
			frame.includes("profile row 01") && !frame.includes("profile row 24"),
	);
	const bounds = modalBounds(piu);
	if (!bounds) throw new Error("no Modal");
	for (let i = 0; i < 40; i++)
		await piu.mockMouse.scroll(bounds.left + 5, bounds.top + 9, "down");
	await piu.waitForFrame(
		(frame) =>
			frame.includes("profile row 24") &&
			/Global +Profile/.test(frame) &&
			!frame.includes("profile row 01"),
	);
	await clickText(piu, "Global");
	await piu.waitForFrame((frame) => /Theme +auto/.test(frame));
});

test("Ctrl+PageUp and Ctrl+PageDown switch tabs without stealing cursor and word movement", async () => {
	await using piu = await startPiu(extensionOptions);
	await openSettings(piu);
	piu.mockInput.pressKey("\x1b[6;5~");
	await piu.waitForFrame((frame) => frame.includes("profile input"));
	await clickText(piu, "profile input");
	await piu.mockInput.typeText("one ab");
	piu.mockInput.pressKey("ARROW_LEFT");
	await piu.mockInput.typeText("X");
	await piu.waitForFrame((frame) => frame.includes("one aXb"));
	piu.mockInput.pressKey("ARROW_LEFT", { meta: true });
	await piu.mockInput.typeText("Y");
	await piu.waitForFrame((frame) => frame.includes("one YaXb"));
	piu.mockInput.pressKey("\x1b[5;5~");
	await piu.waitForFrame((frame) => /Theme +auto/.test(frame));
});

test("the tab strip scrolls sideways to make off-screen tabs clickable", async () => {
	await using piu = await startPiu({ ...extensionOptions, width: 64 });
	await openSettings(piu);
	const bounds = modalBounds(piu);
	if (!bounds) throw new Error("no Modal");
	for (let i = 0; i < 60; i++)
		await piu.mockMouse.scroll(bounds.left + 5, bounds.top + 3, "down", {
			modifiers: { shift: true },
		});
	await piu.waitForFrame((frame) =>
		frame.split("\n").some((line) => line.includes("Last tab")),
	);
	await clickText(piu, "Last tab");
	await piu.waitForFrame((frame) => frame.includes("Last tab content"));
});

test("switching Settings tabs cancels the previous tab's wheel scroll", async () => {
	const clock = new ManualClock();
	await using piu = await startPiu({
		...extensionOptions,
		clock,
		motion: true,
	});
	await openSettings(piu);
	await clickText(piu, "Profile");
	await piu.waitForFrame((frame) => frame.includes("profile row 01"));
	const bounds = modalBounds(piu);
	if (!bounds) throw new Error("no Modal");
	for (let i = 0; i < 12; i++)
		await piu.mockMouse.scroll(bounds.left + 5, bounds.top + 9, "down");
	await clickText(piu, "Additional preferences");
	await piu.waitForFrame((frame) => frame.includes("preference row 01"));
	for (let i = 0; i < 10; i++) {
		clock.advance(20);
		await piu.renderOnce();
	}
	expect(piu.captureCharFrame()).toContain("preference row 01");
});

test("an unplaced personal Extension does not contribute Settings tabs", async () => {
	await using piu = await startPiu({ ...extensionOptions, config: {} });
	expect(await openSettings(piu)).not.toContain("Profile");
});

test("a malformed tab export fails startup with the Extension name and field", async () => {
	await expect(
		startPiu({
			...extensionOptions,
			config: { placement: { side: ["invalid-tab.badge"] } },
		}),
	).rejects.toThrow(/Extension "invalid-tab".*settingsTabs/);
});

test("disabling block animations saves the setting and immediately reveals Thinking", async () => {
	await using piu = await startPiu({
		clock: new ManualClock(),
		motion: true,
		height: 40,
		config: { animations: true },
		script: {
			replies: [{ thinking: "first thought\nlast thought", text: "Answer" }],
		},
	});
	await openSettings(piu);
	piu.mockInput.pressKey("ARROW_DOWN");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((frame) => /Animations +off/.test(frame));
	const saved = readFileSync(join(piu.dir, "config.json"), "utf8");
	expect(JSON.parse(saved).animations).toBe(false);
	piu.mockInput.pressEscape();
	await piu.waitForFrame(() => !modalBounds(piu));
	await piu.mockInput.typeText("Think");
	piu.mockInput.pressEnter();
	await piu.waitForFrame(
		(frame) => frame.includes("Answer") && frame.includes("Thinking"),
	);
	await clickText(piu, "Thinking");
	await piu.renderOnce();
	expect(piu.captureCharFrame()).toContain("last thought");
});

test("the launcher reloads Global settings on Restart", async () => {
	const fixture = prepareFixture({ script, config: { animations: true } });
	try {
		await using piu = spawnPiu(fixture, { env: { PI_OFFLINE: "1" } });
		await piu.waitForText("faux-1");
		piu.submit("/settings");
		await piu.waitForText("Animations");
		piu.type("\r\x1b[B\r");
		await piu.waitForText("off");
		piu.type("\x1b[27u");
		const beforeRestart = piu.mark();
		piu.submit("/restart");
		await piu.waitForStarts(2);
		await piu.waitForText("faux-1", beforeRestart);
		const reopened = piu.mark();
		piu.submit("/settings");
		await piu.waitForText("light", reopened);
		await piu.waitForText("off", reopened);
	} finally {
		fixture.removeDir();
	}
}, 20000);

for (const mode of ["auto", "light", "dark"] as const) {
	test(`Config accepts theme.mode: ${mode}`, async () => {
		await using piu = await startPiu({ script, config: { theme: { mode } } });
		expect(await openSettings(piu)).toMatch(new RegExp(`Theme +${mode}`));
	});
}

test("an invalid theme mode fails startup with its Config path", async () => {
	await expect(
		startPiu({ script, config: { theme: { mode: "sepia" } } }),
	).rejects.toThrow("theme.mode");
});
