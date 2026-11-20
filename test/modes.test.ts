import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RGBA } from "@opentui/core";
import { blocker } from "./blocker.ts";
import {
	inputArea,
	inputHints,
	modalText,
	startPiu,
	working,
} from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

function fgAt(piu: Piu, x: number, y: number) {
	let column = 0;
	for (const span of piu.captureSpans().lines[y]?.spans ?? []) {
		if (x < column + span.width) return span.fg;
		column += span.width;
	}
	return undefined;
}

function hintCell(frame: string, needle: string) {
	const row = frame.split("\n").findIndex((line) => line.includes(needle));
	const column = (frame.split("\n")[row] ?? "").indexOf(needle);
	return { row, column };
}

function wholeLine(frame: string, text: string) {
	return frame.split("\n").some((line) => line.trim() === text);
}

function withModes(files: Record<string, string>) {
	const dir = mkdtempSync(join(tmpdir(), "piu-test-"));
	const modes = join(dir, "agent", "modes");
	mkdirSync(modes, { recursive: true });
	for (const [name, body] of Object.entries(files)) {
		writeFileSync(join(modes, name), body);
	}
	return {
		dir,
		[Symbol.dispose]: () => rmSync(dir, { recursive: true, force: true }),
	};
}

const alphaMode = `---
model: faux/faux-2
thinking: high
tools: [read]
---
Alpha instructions here.
`;

test("direct mode applies overrides and Build restores base", async () => {
	using fixture = withModes({ "Alpha.md": alphaMode });
	await using piu = await startPiu({
		script: {
			replies: [
				"base {model} {reasoning} {tools} |{modeInstructions}|",
				"alpha {model} {reasoning} {tools} |{modeInstructions}|",
				"build {model} {reasoning} {tools} |{modeInstructions}|",
			],
		},
		dir: fixture.dir,
	});
	await piu.waitForFrame((f) => f.includes("faux-1"));
	await piu.mockInput.typeText("first");
	piu.mockInput.pressEnter();
	const baseFrame = await piu.waitForFrame((f) =>
		/base faux-1 off (\S+) \|\|/.test(f),
	);
	const baseTools = /base faux-1 off (\S+) \|\|/.exec(baseFrame)?.[1];
	expect(baseTools).toBeTruthy();

	await piu.mockInput.typeText("/mode alpha");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => inputHints(f).startsWith("Alpha"));

	await piu.mockInput.typeText("second");
	piu.mockInput.pressEnter();
	const alphaFrame = await piu.waitForFrame(
		(f) =>
			f.includes("alpha faux-2 high read |") &&
			f.includes("Alpha instructions here."),
	);
	expect(alphaFrame).toContain("Alpha instructions here.");

	await piu.mockInput.typeText("/mode build");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => inputHints(f).startsWith("Build"));

	await piu.mockInput.typeText("third");
	piu.mockInput.pressEnter();
	const buildFrame = await piu.waitForFrame((f) =>
		f.includes(`build faux-1 off ${baseTools} ||`),
	);
	expect(buildFrame).toContain(`build faux-1 off ${baseTools} ||`);
});

const plainMode = (instructions: string) => `---\n---\n${instructions}\n`;

test("slash picker marks current and selects a mode", async () => {
	using fixture = withModes({
		"Alpha.md": plainMode("Alpha instructions here."),
		"Zulu.md": plainMode("Zulu instructions here."),
	});
	await using piu = await startPiu({
		script: { replies: [] },
		dir: fixture.dir,
	});
	await piu.waitForFrame((f) => f.includes("faux-1"));
	await piu.mockInput.typeText("/mode");
	piu.mockInput.pressEnter();
	const dialog = await piu.waitForFrame((f) => {
		const text = modalText(piu, f);
		return (
			text.includes("Build (current)") &&
			text.includes("Alpha") &&
			text.includes("Zulu")
		);
	});
	const text = modalText(piu, dialog);
	const order = ["Build (current)", "Alpha", "Zulu"].map((label) =>
		text.indexOf(label),
	);
	expect(order.every((at) => at >= 0)).toBe(true);
	expect([...order].sort((a, b) => a - b)).toEqual(order);

	piu.mockInput.pressArrow("down");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => inputHints(f).startsWith("Alpha"));
});

test("unknown mode lists available names and leaves the mode unchanged", async () => {
	using fixture = withModes({
		"Alpha.md": plainMode("Alpha instructions here."),
		"Zulu.md": plainMode("Zulu instructions here."),
	});
	await using piu = await startPiu({
		script: { replies: ["REPLY {lastUser}", "REPLY {lastUser}"] },
		dir: fixture.dir,
	});
	await piu.waitForFrame((f) => f.includes("faux-1"));
	await piu.mockInput.typeText("/mode missing");
	piu.mockInput.pressEnter();
	const toast = await piu.waitForFrame(
		(f) =>
			f.includes("Unknown mode missing") &&
			f.includes("Available: Build, Alpha, Zulu") &&
			inputHints(f).startsWith("Build ·"),
	);
	expect(toast).toContain("Available: Build, Alpha, Zulu");
	expect(inputHints(toast).startsWith("Build")).toBe(true);
	await piu.mockInput.typeText("ping");
	piu.mockInput.pressEnter();
	const settled = await piu.waitForFrame((f) => f.includes('REPLY "ping"'));
	expect(settled).not.toContain('REPLY "/mode');
});

test("slash completion offers one mode command", async () => {
	using fixture = withModes({});
	await using piu = await startPiu({
		script: { replies: [] },
		dir: fixture.dir,
	});
	await piu.waitForFrame((f) => f.includes("faux-1"));
	await piu.mockInput.typeText("/mode");
	const rowOf = (frame: string, label: string) =>
		frame.split("\n").some((line) => line.slice(1).startsWith(` ${label}`));
	const frame = await piu.waitForFrame(
		(f) => rowOf(f, "/mode ") && rowOf(f, "/model"),
	);
	const rows = frame
		.split("\n")
		.filter((line) => line.slice(1).startsWith(" /mode "));
	expect(rows).toHaveLength(1);
});

test("Alt+M cycles and wraps without submitting a turn", async () => {
	using fixture = withModes({
		"Zulu.md": plainMode("Zulu instructions here."),
		"plan.md": plainMode("Plan instructions here."),
	});
	await using piu = await startPiu({
		script: { replies: ["REPLY {lastUser}", "REPLY {lastUser}"] },
		dir: fixture.dir,
	});
	await piu.waitForFrame((f) => f.includes("faux-1"));
	for (const name of ["Plan", "Zulu", "Build"]) {
		piu.mockInput.pressKey("m", { meta: true });
		await piu.waitForFrame((f) => {
			expect(f).not.toContain("[sending]");
			return inputHints(f).startsWith(`${name} ·`);
		});
	}
	await piu.waitForFrame(
		(f) => inputHints(f).startsWith("Build ·") && !f.includes(":next"),
	);
	await piu.mockInput.typeText("ping");
	piu.mockInput.pressEnter();
	const settled = await piu.waitForFrame((f) => f.includes('REPLY "ping"'));
	expect(settled).not.toContain(":next");
	expect(settled).not.toContain('REPLY "/mode');
});

test("clicking the current mode cycles without submitting the draft", async () => {
	using fixture = withModes({ "Plan.md": plainMode("Plan instructions.") });
	await using piu = await startPiu({
		script: { replies: [] },
		dir: fixture.dir,
		config: { keybindings: { "modes.next": [] } },
	});
	await piu.waitForFrame((f) => f.includes("faux-1"));
	await piu.mockInput.typeText("draft");
	for (const [current, next] of [
		["Build", "Plan"],
		["Plan", "Build"],
	] as const) {
		const frame = await piu.waitForFrame(
			(f) =>
				inputHints(f).startsWith(current) && inputArea(f).includes("draft"),
		);
		const { row, column } = hintCell(frame, current);
		await piu.mockMouse.click(column, row);
		await piu.waitForFrame((f) => inputHints(f).startsWith(next));
	}
	await piu.mockInput.typeText(" kept");
	await piu.waitForFrame((f) => inputArea(f).includes("draft kept"));
});

test("mode cycle can be rebound", async () => {
	using fixture = withModes({
		"Alpha.md": plainMode("Alpha instructions here."),
	});
	await using piu = await startPiu({
		script: { replies: ["REPLY {lastUser}"] },
		dir: fixture.dir,
		config: { keybindings: { "modes.next": "alt+y" } },
	});
	await piu.waitForFrame((f) => f.includes("faux-1"));
	piu.mockInput.pressKey("m", { meta: true });
	await piu.mockInput.typeText("/mode");
	piu.mockInput.pressEnter();
	const unchanged = await piu.waitForFrame((f) =>
		modalText(piu, f).includes("Build (current)"),
	);
	expect(modalText(piu, unchanged)).toContain("Build (current)");
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !modalText(piu, f));
	piu.mockInput.pressKey("y", { meta: true });
	await piu.waitForFrame((f) => inputHints(f).startsWith("Alpha ·"));
	await piu.mockInput.typeText("/mode");
	piu.mockInput.pressEnter();
	const dialog = await piu.waitForFrame((f) =>
		modalText(piu, f).includes("Alpha (current)"),
	);
	expect(modalText(piu, dialog)).toContain("Alpha (current)");
});

test("mode change is refused during a turn", async () => {
	using fixture = withModes({
		"Alpha.md": plainMode("Alpha instructions here."),
	});
	using block = blocker();
	await using piu = await startPiu({
		script: { replies: [block.step, "All done"] },
		dir: fixture.dir,
	});
	await piu.waitForFrame((f) => f.includes("faux-1"));
	await piu.mockInput.typeText("go");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => working(f));
	piu.mockInput.pressKey("m", { meta: true });
	const toast = await piu.waitForFrame(
		(f) =>
			f.includes("Cannot change the agent mode") &&
			working(f) &&
			inputHints(f).startsWith("Build ·"),
	);
	expect(inputHints(toast).startsWith("Build ·")).toBe(true);
	block.release();
	await piu.waitForFrame((f) => f.includes("All done"));
});

const allowlistMode = `---
tools: [read, ask_user, ask_user_question]
---
Alpha instructions here.
`;

test("names with edge whitespace or a current-marker suffix are skipped", async () => {
	using fixture = withModes({
		"Alpha .md": plainMode("Spacey instructions."),
		"Build (current).md": plainMode("Marker instructions."),
		"Zulu.md": plainMode("Zulu instructions here."),
	});
	await using piu = await startPiu({
		script: { replies: ["REPLY {lastUser}"] },
		dir: fixture.dir,
	});
	await piu.waitForFrame((f) => f.includes("faux-1"));
	await piu.mockInput.typeText("/mode");
	piu.mockInput.pressEnter();
	const dialog = await piu.waitForFrame(
		(f) =>
			modalText(piu, f).includes("Zulu") &&
			modalText(piu, f).includes("Build (current)"),
	);
	const text = modalText(piu, dialog);
	expect(text.match(/Build \(current\)/g)).toHaveLength(1);
	expect(text).not.toContain("Alpha");
	expect(text).not.toContain("Marker instructions.");
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !modalText(piu, f));
	await piu.mockInput.typeText("/mode alpha");
	piu.mockInput.pressEnter();
	const toast = await piu.waitForFrame(
		(f) =>
			f.includes("Unknown mode alpha") && f.includes("Available: Build, Zulu"),
	);
	expect(toast).toContain("Available: Build, Zulu");
});

test("a tool whitelist holds for the whole run against a late setActiveTools", async () => {
	using fixture = withModes({
		"Alpha.md": `---
tools: [read, bash, edit, write, ask_user]
---
Alpha instructions here.
`,
	});
	await using piu = await startPiu({
		script: {
			replies: [
				{
					text: "first {tools}",
					toolCalls: [{ name: "bash", args: { command: "true" } }],
				},
				"after {tools}",
			],
		},
		dir: fixture.dir,
		extraBackendArgs: ["--tools", "read,bash,edit,write,ask_user"],
		installedPiExtensions: [
			join(import.meta.dir, "fixtures/pi-extensions/late-tool.ts"),
		],
	});
	await piu.waitForFrame((f) => f.includes("faux-1"));
	await piu.mockInput.typeText("/mode alpha");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => inputHints(f).startsWith("Alpha ·"));
	await piu.mockInput.typeText("go");
	piu.mockInput.pressEnter();
	const tools = "ask_user,bash,edit,read,write";
	const frame = await piu.waitForFrame(
		(f) => wholeLine(f, `first ${tools}`) && wholeLine(f, `after ${tools}`),
	);
	expect(wholeLine(frame, `first ${tools}`)).toBe(true);
	expect(wholeLine(frame, `after ${tools}`)).toBe(true);
});

test("mode tool allowlist holds before and after a tool result", async () => {
	using fixture = withModes({ "Alpha.md": allowlistMode });
	await using piu = await startPiu({
		script: {
			replies: [
				{
					text: "first {tools}",
					toolCalls: [
						{
							name: "read",
							args: {
								path: join(
									import.meta.dir,
									"fixtures/pi-extensions/ask-user-question.ts",
								),
							},
						},
					],
				},
				"after {tools}",
			],
		},
		dir: fixture.dir,
		installedPiExtensions: [
			join(import.meta.dir, "fixtures/pi-extensions/ask-user-question.ts"),
		],
	});
	await piu.waitForFrame((f) => f.includes("faux-1"));
	await piu.mockInput.typeText("/mode alpha");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => inputHints(f).startsWith("Alpha ·"));
	await piu.mockInput.typeText("go");
	piu.mockInput.pressEnter();
	const frame = await piu.waitForFrame(
		(f) =>
			wholeLine(f, "first ask_user,read") &&
			wholeLine(f, "after ask_user,read"),
	);
	expect(wholeLine(frame, "first ask_user,read")).toBe(true);
	expect(wholeLine(frame, "after ask_user,read")).toBe(true);
});

test("the mode hint keeps its Config color even with a draft", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		config: { theme: { agentMode: "#123456" } },
	});
	await piu.waitForFrame((f) => f.includes("faux-1"));
	await piu.mockInput.typeText("x");
	const frame = await piu.waitForFrame(
		(f) => inputArea(f).includes("x") && inputHints(f).startsWith("Build"),
	);
	expect(inputHints(frame)).not.toContain("/ commands");
	const { row, column } = hintCell(frame, "Build");
	expect(fgAt(piu, column, row)?.equals(RGBA.fromHex("#123456"))).toBe(true);
});

test("project modes require trust", async () => {
	const cases = [
		{
			flag: "--no-approve",
			expected: "Global instructions.",
			other: "Project instructions.",
		},
		{
			flag: "--approve",
			expected: "Project instructions.",
			other: "Global instructions.",
		},
	] as const;
	for (const { flag, expected, other } of cases) {
		using fixture = withModes({
			"Alpha.md": plainMode("Global instructions."),
		});
		const project = join(fixture.dir, ".pi", "modes");
		mkdirSync(project, { recursive: true });
		writeFileSync(
			join(project, "Alpha.md"),
			plainMode("Project instructions."),
		);
		await using piu = await startPiu({
			script: { replies: ["got |{modeInstructions}|"] },
			dir: fixture.dir,
			extraBackendArgs: [flag],
		});
		await piu.waitForFrame((f) => f.includes("faux-1"));
		await piu.mockInput.typeText("/mode alpha");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => inputHints(f).startsWith("Alpha"));
		await piu.mockInput.typeText("go");
		piu.mockInput.pressEnter();
		const frame = await piu.waitForFrame(
			(f) => f.includes("got |<mode>") && f.includes(expected),
		);
		expect(frame).toContain(expected);
		expect(frame).not.toContain(other);
	}
});
