import { expect, test } from "bun:test";
import { basename, join } from "node:path";
import { RGBA, TextareaRenderable } from "@opentui/core";
import { darkTheme } from "../src/theme.ts";
import {
	focusedPanels,
	glyphs,
	inputArea,
	inputTop,
	panelText,
	startPiu,
} from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

for (const width of [80, 160]) {
	test(`a heavy line across the main column separates chat and input at ${width} columns`, async () => {
		await using piu = await startPiu({ script: { replies: [] }, width });
		const frame = await piu.waitForFrame(
			(f) => f.includes("faux-1") && f.includes("/ commands · @ files"),
		);
		const top = inputTop();
		const modelRow = frame
			.split("\n")
			.findIndex((line) => line.includes("faux-1"));
		expect(top).toBe(modelRow + 1);
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
		.some((line) => /[█▀▄]/.test([...line][field.screenX + field.width] ?? ""));
}

test("the cursor starts on the first line of the input Panel", async () => {
	await using piu = await startPiu({ script: { replies: [] }, width: 80 });
	const frame = await piu.waitForFrame(
		(frame) =>
			frame.includes("faux-1") && frame.includes("/ commands · @ files"),
	);
	const field = editor(piu);
	expect(inputArea(frame).split("\n")[0]).toContain("/ commands · @ files");
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

test("the selected model stays above the input while the chat scrolls", async () => {
	const reply = Array.from({ length: 50 }, (_, at) => `Reply ${at}`).join(
		"\n\n",
	);
	await using piu = await startPiu({ script: { replies: [reply] }, width: 80 });
	await piu.mockInput.typeText("Fill the conversation");
	piu.mockInput.pressEnter();
	const bottom = await piu.waitForFrame((frame) => frame.includes("Reply 49"));
	const modelRow = bottom
		.split("\n")
		.findIndex((line) => line.includes("faux-1"));
	expect(modelRow).toBeLessThan(editor(piu).screenY);
	piu.mockInput.pressKey("HOME", { ctrl: true });
	const top = await piu.waitForFrame((frame) =>
		panelText(frame, 10).includes("Reply 0"),
	);
	expect(top.split("\n")[modelRow]).toContain("faux-1");
	expect(top.split("\n")[modelRow]).toContain(":no reasoning");
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
	const barX = field.screenX + field.width;
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
			inputArea(frame).includes(basename(piu.dir)),
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
			lastSuggestion(frame) === editor(piu).screenY - 3,
	);
	expect(lastSuggestion(frame)).toBe(editor(piu).screenY - 3);
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
