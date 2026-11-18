import { expect, test } from "bun:test";
import { basename, join } from "node:path";
import { RGBA, TextareaRenderable } from "@opentui/core";
import { darkTheme } from "../src/theme.ts";
import {
	bottomLine,
	focusedPanels,
	glyphs,
	inputArea,
	inputHints,
	inputTop,
	panelBoxes,
	startPiu,
	working,
} from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

for (const width of [80, 160]) {
	test(`a heavy line across the main column separates chat and input at ${width} columns`, async () => {
		await using piu = await startPiu({ script: { replies: [] }, width });
		const frame = await piu.waitForFrame(
			(f) => f.includes("faux-1") && idleHints(f),
		);
		const top = inputTop();
		const agent = panelBoxes(piu).find((box) => box.id === "agent");
		expect(top).toBe((agent?.y ?? 0) + (agent?.height ?? 0) - 1);
		expect(frame.split("\n")[top]).toBe(glyphs.heavyRule.repeat(width));
		expect(editor(piu).height).toBe(4);
	});
}

function editor(piu: Piu) {
	const field = piu.renderer.currentFocusedRenderable;
	if (!(field instanceof TextareaRenderable))
		throw new Error("Prompt is not focused");
	return field;
}

function hasThumb(piu: Piu, frame: string) {
	const field = editor(piu);
	return frame
		.split("\n")
		.slice(field.screenY, field.screenY + field.height)
		.some((line) =>
			/[█▀▄]/.test([...line][field.screenX + field.width + 1] ?? ""),
		);
}

test("the cursor starts on the first line of the input Panel", async () => {
	await using piu = await startPiu({ script: { replies: [] }, width: 80 });
	const frame = await piu.waitForFrame(
		(frame) => frame.includes("faux-1") && idleHints(frame),
	);
	const field = editor(piu);
	expect(inputArea(frame).split("\n")[0]?.trim()).toBe("");
	expect(piu.renderer.getCursorState().y).toBe(field.screenY + 1);
	expect(piu.renderer.getCursorState().x).toBe(field.screenX + 1);
});

test("the default editor has four rows, no input title, and the Panel fill", async () => {
	await using piu = await startPiu({ script: { replies: [] }, width: 80 });
	await piu.mockInput.typeText("Unfilled composer");
	const frame = await piu.waitForFrame(
		(frame) => frame.includes("Unfilled composer") && frame.includes("faux-1"),
	);
	expect(editor(piu).height).toBe(4);
	expect(focusedPanels(piu, frame)).toEqual(["input"]);
	expect(frame.split("\n")[inputTop()]).toBe(glyphs.heavyRule.repeat(80));
	const span = piu
		.captureSpans()
		.lines.flatMap((line) => line.spans)
		.find((span) => span.text.includes("Unfilled composer"));
	expect(span?.bg.equals(RGBA.fromHex(darkTheme.surface))).toBe(true);
	const top = inputTop();
	expect(
		piu
			.captureSpans()
			.lines[top]?.spans[0]?.fg.equals(RGBA.fromHex(darkTheme.text)),
	).toBe(true);
});

test("wrapped lines grow and shrink the editor when the terminal is resized", async () => {
	await using piu = await startPiu({ script: { replies: [] }, width: 80 });
	await piu.mockInput.pasteBracketedText("w".repeat(200));
	await piu.waitForFrame(
		(frame) => frame.includes("wwww") && editor(piu).height === 4,
	);
	piu.resize(40, 30);
	await piu.waitForFrame(
		(frame) =>
			frame.includes("wwww") &&
			editor(piu).height === Math.ceil(200 / editor(piu).width),
	);
	expect(editor(piu).height).toBeGreaterThan(4);
	piu.resize(80, 30);
	await piu.waitForFrame(
		(frame) => frame.includes("wwww") && editor(piu).height === 4,
	);
});

test("the editor grows for extra lines and shrinks to four after sending", async () => {
	await using piu = await startPiu({
		script: { replies: ["Received the draft"] },
		width: 80,
	});
	await piu.mockInput.pasteBracketedText("one\ntwo\nthree\nfour\nfive\nsix");
	const grown = await piu.waitForFrame(
		(frame) => frame.includes("six") && editor(piu).height === 6,
	);
	for (const line of ["one", "two", "three", "four", "five", "six"])
		expect(inputArea(grown)).toContain(line);
	piu.mockInput.pressEnter();
	await piu.waitForFrame(
		(frame) => frame.includes("Received the draft") && editor(piu).height === 4,
	);
});

test("the editor caps at sixteen rows and its scrollbar can reveal the beginning", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		width: 80,
		height: 50,
	});
	const lines = Array.from(
		{ length: 20 },
		(_, at) => `Draft ${String(at + 1).padStart(2, "0")}`,
	);
	await piu.mockInput.pasteBracketedText(lines.join("\n"));
	const overflow = await piu.waitForFrame(
		(frame) =>
			inputArea(frame).includes("Draft 20") &&
			editor(piu).height === 16 &&
			hasThumb(piu, frame),
	);
	expect(inputArea(overflow)).not.toContain("Draft 01");
	const field = editor(piu);
	const barX = field.screenX + field.width + 1;
	expect(
		overflow
			.split("\n")
			.slice(field.screenY, field.screenY + field.height)
			.every((line) => [...line][barX - 1] === " "),
	).toBe(true);
	expect(
		overflow
			.split("\n")
			.slice(field.screenY, field.screenY + field.height)
			.some((line) => /[█▀▄]/.test([...line][barX] ?? "")),
	).toBe(true);
	await piu.mockMouse.click(barX, field.screenY);
	await piu.waitForFrame((frame) => inputArea(frame).includes("Draft 01"));
	expect(editor(piu)).toBe(field);
});

test("the scrollbar appears only beyond sixteen rows and the wheel scrolls the draft", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		width: 80,
		height: 50,
	});
	const lines = Array.from(
		{ length: 16 },
		(_, at) => `Line ${String(at + 1).padStart(2, "0")}`,
	);
	await piu.mockInput.pasteBracketedText(lines.join("\n"));
	await piu.waitForFrame(
		(frame) =>
			inputArea(frame).includes("Line 16") &&
			editor(piu).height === 16 &&
			!hasThumb(piu, frame),
	);
	piu.mockInput.pressEnter({ shift: true });
	await piu.mockInput.typeText("Line 17");
	await piu.waitForFrame(
		(frame) => inputArea(frame).includes("Line 17") && hasThumb(piu, frame),
	);
	const field = editor(piu);
	for (let tick = 0; tick < 3; tick++)
		await piu.mockMouse.scroll(field.screenX + 2, field.screenY + 2, "up");
	await piu.waitForFrame((frame) => inputArea(frame).includes("Line 01"));
	expect(field.height).toBe(16);
});

test("a short terminal keeps the draft cursor and directory visible when the editor cannot reach sixteen rows", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		width: 80,
		height: 16,
	});
	await piu.mockInput.pasteBracketedText(
		Array.from({ length: 20 }, (_, at) => `Short ${at + 1}`).join("\n"),
	);
	const frame = await piu.waitForFrame(
		(frame) =>
			inputArea(frame).includes("Short 20") &&
			bottomLine(frame).includes(basename(piu.dir)),
	);
	const field = editor(piu);
	expect(field.height).toBeGreaterThanOrEqual(4);
	expect(field.height).toBeLessThan(16);
	expect(
		frame.split("\n").findIndex((line) => line.includes(basename(piu.dir))),
	).toBeGreaterThanOrEqual(field.screenY + field.height);
	expect(piu.renderer.getCursorState().visible).toBe(true);
});

test("autocomplete stays above a multiline editor when the terminal is resized", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		width: 80,
		height: 40,
		cwd: join(import.meta.dir, "fixtures/extensions"),
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await piu.mockInput.pasteBracketedText("one\ntwo\nthree\nfour\n");
	await piu.mockInput.typeText("@greeter");
	await piu.waitForFrame(
		(frame) => frame.includes("@greeter/index.tsx") && editor(piu).height === 5,
	);
	piu.resize(80, 50);
	const lastSuggestion = (frame: string) =>
		frame
			.split("\n")
			.findLastIndex((line) => line.slice(1).startsWith(" @greeter/index.tsx"));
	const frame = await piu.waitForFrame(
		(frame) =>
			frame.split("\n").length >= 50 &&
			frame.includes("@greeter/index.tsx") &&
			lastSuggestion(frame) === editor(piu).screenY - 4,
	);
	expect(lastSuggestion(frame)).toBe(editor(piu).screenY - 4);
});

test("growing the editor preserves the caret at the end of the draft", async () => {
	await using piu = await startPiu({ script: { replies: [] }, width: 80 });
	await piu.mockInput.pasteBracketedText("one\ntwo\nthree\nfour\nlast");
	await piu.waitForFrame(
		(frame) => inputArea(frame).includes("last") && editor(piu).height === 5,
	);
	await piu.mockInput.typeText("X");
	await piu.waitForFrame((frame) => inputArea(frame).includes("lastX"));
});

function fgAt(piu: Piu, x: number, y: number) {
	let column = 0;
	for (const span of piu.captureSpans().lines[y]?.spans ?? []) {
		if (x < column + span.width) return span.fg;
		column += span.width;
	}
	return undefined;
}

const idleHints = (frame: string) => inputHints(frame).startsWith("/ commands");

test("one blank row separates the heavy line from the first input row", async () => {
	await using piu = await startPiu({ script: { replies: [] }, width: 80 });
	const frame = await piu.waitForFrame(
		(f) => f.includes("faux-1") && idleHints(f),
	);
	const top = inputTop();
	expect(frame.split("\n")[top]).toBe(glyphs.heavyRule.repeat(80));
	expect(frame.split("\n")[top + 1]?.trim()).toBe("");
	expect(editor(piu).screenY).toBe(top + 2);
	expect(editor(piu).height).toBe(4);
});

test("the first input row starts with a prompt mark, signal red when focused and faint when not", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		width: 80,
	});
	await piu.mockInput.pasteBracketedText("first line\nsecond line");
	const frame = await piu.waitForFrame(
		(f) => inputArea(f).includes("second line") && idleHints(f),
	);
	const field = editor(piu);
	const rows = frame.split("\n");
	const mark = [...(rows[field.screenY] ?? "")].indexOf("›");
	expect(mark).toBe(field.screenX - 2);
	expect([...(rows[field.screenY + 1] ?? "")][mark]).toBe(" ");
	expect(inputArea(frame).split("\n")[1]?.startsWith("second line")).toBe(true);
	expect(
		fgAt(piu, mark, field.screenY)?.equals(RGBA.fromHex(darkTheme.signal)),
	).toBe(true);

	piu.mockInput.pressTab();
	await piu.waitForFrame(
		() =>
			fgAt(piu, mark, field.screenY)?.equals(RGBA.fromHex(darkTheme.faint)) ??
			false,
	);
	expect(focusedPanels(piu, piu.captureCharFrame())).not.toContain("input");
});

test("the cursor is a signal red block", async () => {
	await using piu = await startPiu({ script: { replies: [] }, width: 80 });
	await piu.waitForFrame((f) => f.includes("faux-1") && idleHints(f));
	const cursor = piu.renderer.getCursorState();
	expect(cursor.visible).toBe(true);
	expect(cursor.style).toBe("block");
	expect(cursor.color.equals(RGBA.fromHex(darkTheme.signal))).toBe(true);
});

test("idle hints sit under the input in faint, commands on the left and keys on the right", async () => {
	await using piu = await startPiu({ script: { replies: [] }, width: 80 });
	const frame = await piu.waitForFrame(
		(f) => f.includes("faux-1") && idleHints(f),
	);
	const hints = inputHints(frame);
	expect(hints.startsWith("/ commands   @ files")).toBe(true);
	expect(hints.endsWith("⏎ send   ⇧⏎ new line")).toBe(true);
	const field = editor(piu);
	const row = field.screenY + field.height;
	const column = (frame.split("\n")[row] ?? "").indexOf("/ commands");
	expect(column).toBe(field.screenX);
	expect(fgAt(piu, column, row)?.equals(RGBA.fromHex(darkTheme.faint))).toBe(
		true,
	);
	expect(frame).not.toContain("/ commands · @ files");
});

test("while the agent works the hints name stop and queue, and no Working line is above the input", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{ toolCalls: [{ name: "bash", args: { command: "sleep 1" } }] },
				"All done",
			],
		},
		width: 80,
	});
	await piu.mockInput.typeText("go");
	piu.mockInput.pressEnter();
	const busy = await piu.waitForFrame(
		(f) => working(f) && inputHints(f).endsWith("esc stop   alt+⏎ queue"),
	);
	expect(busy).not.toContain("Working");
	expect(inputHints(busy)).not.toContain("send");
	await piu.waitForFrame(
		(f) => f.includes("All done") && !working(f) && idleHints(f),
	);
	expect(inputHints(piu.captureCharFrame()).endsWith("⇧⏎ new line")).toBe(true);
});

test("a remapped input.newline key is the one the hint names", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		width: 80,
		config: { keybindings: { "input.newline": "alt+n" } },
	});
	const frame = await piu.waitForFrame(
		(f) => f.includes("faux-1") && idleHints(f),
	);
	expect(inputHints(frame).endsWith("⏎ send   alt+n new line")).toBe(true);
});

test("a narrow input cuts the key hints before the command hints", async () => {
	await using piu = await startPiu({ script: { replies: [] }, width: 36 });
	const frame = await piu.waitForFrame((f) => idleHints(f));
	const hints = inputHints(frame);
	expect(hints.startsWith("/ commands   @ files")).toBe(true);
	expect(hints).not.toContain("new line");
});
