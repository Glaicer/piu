import { expect, test } from "bun:test";
import { basename } from "node:path";
import { RGBA } from "@opentui/core";
import { darkTheme } from "../src/theme.ts";
import {
	bottomLine,
	glyphs,
	inputArea,
	inputHints,
	messageBar,
	modalTitle,
	onModalFill,
	panelBoxes,
	panelText,
	startPiu,
} from "./harness.ts";

test("the default side Panel is hidden while the chat shows its welcome", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	const frame = await piu.waitForFrame(
		(frame) =>
			frame.includes("faux-1") &&
			frame.includes("What would you like to build?"),
	);
	expect(panelBoxes(piu).map((box) => box.id)).not.toContain("side");
	const rows = panelText(frame, 10).split("\n");
	const heading = rows.findIndex((line) =>
		line.includes("What would you like to build?"),
	);
	expect(rows[heading + 1]?.trim()).toBe(
		"Ask a question, describe a change, or share an idea.",
	);
	expect(frame).not.toContain(
		"Your workspace is ready. Start with a prompt below.",
	);
});

test("the idle composer shows only command and file hints", async () => {
	await using piu = await startPiu({ script: { replies: [] }, width: 80 });
	const frame = await piu.waitForFrame(
		(frame) =>
			bottomLine(frame).includes(basename(piu.dir)) &&
			inputHints(frame).startsWith("/ commands   @ files"),
	);
	expect(inputArea(frame).trim()).toBe("");
	expect(inputArea(frame).split("\n")).toHaveLength(4);
	expect(inputHints(frame).replace(/\s+/g, " ")).toBe(
		"/ commands @ files ⏎ send ⇧⏎ new line",
	);
});

test("user messages have no added prompt marker and preserve a typed greater-than sign", async () => {
	await using piu = await startPiu({
		script: { replies: ["First reply", "Second reply"] },
	});
	await piu.mockInput.typeText("A plain prompt");
	piu.mockInput.pressEnter();
	const first = await piu.waitForFrame((frame) =>
		frame.includes("First reply"),
	);
	const firstRow = panelText(first, 10)
		.split("\n")
		.find((line) => line.includes("A plain prompt"));
	expect(firstRow?.trim()).toBe(
		messageBar("A plain prompt", firstRow?.length).trim(),
	);

	await piu.mockInput.typeText("> A deliberate quote");
	piu.mockInput.pressEnter();
	const second = await piu.waitForFrame((frame) =>
		frame.includes("Second reply"),
	);
	const secondRow = panelText(second, 10)
		.split("\n")
		.find((line) => line.includes("A deliberate quote"));
	expect(secondRow?.trim()).toBe(
		messageBar("> A deliberate quote", secondRow?.length).trim(),
	);
});

test("a user message and an opened tool card body stand out from the Panel with a raised fill", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{
					toolCalls: [{ name: "bash", args: { command: "printf RES%s ULT" } }],
				},
				"All done",
			],
		},
	});
	await piu.mockInput.typeText("Shade me");
	piu.mockInput.pressEnter();
	const frame = await piu.waitForFrame((f) => f.includes("All done"));
	const raised = RGBA.fromHex(darkTheme.raised);
	const bgOf = (needle: string) =>
		piu
			.captureSpans()
			.lines.flatMap((line) => line.spans)
			.find((span) => span.text.includes(needle))?.bg;
	expect(bgOf("Shade me")?.equals(raised)).toBe(true);

	const rows = frame.split("\n");
	const row = rows.findIndex((line) => line.includes(" bash "));
	await piu.mockMouse.click((rows[row] ?? "").indexOf(" bash ") + 1, row);
	await piu.waitForFrame((f) => f.includes("RESULT"));
	expect(bgOf("RESULT")?.equals(raised)).toBe(true);
});

test("a compact tool row keeps its status visible next to a long command on a narrow terminal", async () => {
	await using piu = await startPiu({
		width: 64,
		script: {
			replies: [
				{
					toolCalls: [
						{
							name: "bash",
							args: { command: `printf '%s' '${"long ".repeat(25)}'` },
						},
					],
				},
				"Finished cleanly",
			],
		},
	});
	await piu.mockInput.typeText("Run this");
	piu.mockInput.pressEnter();
	const frame = await piu.waitForFrame((frame) =>
		frame.includes("Finished cleanly"),
	);
	const rows = panelText(frame, 10).split("\n");
	const row = rows.findIndex((line) => line.includes(" bash"));
	expect(rows[row]).toMatch(/●\s+\d+(\.\d+)?m?s/);
	expect(rows[row - 1]).not.toContain(glyphs.topLeft);
	expect(rows[row + 1]).not.toContain(glyphs.bottomLeft);
});

test("the model picker is a raised Card with its name and a visible dismissal hint", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	piu.mockInput.pressKey("l", { ctrl: true });
	const frame = await piu.waitForFrame((frame) => frame.includes("faux-2"));
	expect(frame).toContain(modalTitle("Models"));
	expect(frame).toContain("Esc close");
	const rows = frame.split("\n");
	const top = rows.findIndex((line) => line.includes(modalTitle("Models")));
	const left = (rows[top] ?? "").indexOf(modalTitle("Models")) - 2;
	expect(onModalFill(piu, left, top)).toBe(true);
	expect(onModalFill(piu, left, top - 1)).toBe(true);
	expect(rows[top - 1]?.slice(left, left + 20).trim()).toBe("");
	expect(rows[top]?.[left]).toBe(" ");
	expect(rows[top + 1]?.[left]).toBe(" ");
	const title = piu
		.captureSpans()
		.lines.flatMap((line) => line.spans)
		.find((span) => span.text.includes("Models"));
	expect(title?.bg.equals(RGBA.fromHex(darkTheme.raised))).toBe(true);
});
